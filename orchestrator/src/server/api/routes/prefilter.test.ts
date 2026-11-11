import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const VALID_CONFIG = {
  enabled: true,
  title: { exclude: ["analyst"] },
};

describe.sequential("Prefilter API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  let configDir: string;
  let configPath: string;

  const request = (path: string, init?: RequestInit) =>
    fetch(`${baseUrl}/api/prefilter${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });

  const boot = async (extraEnv: Record<string, string> = {}) => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { PREFILTER_CONFIG_PATH: configPath, ...extraEnv },
    }));
  };

  const seedJob = async (
    title: string,
    url: string,
    source: "linkedin" | "manual" = "linkedin",
  ) => {
    const { createJob } = await import("@server/repositories/jobs");
    return createJob({
      source,
      title,
      employer: "Acme",
      jobUrl: url,
      jobDescription: "desc",
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-cfg-"));
    configPath = join(configDir, "prefilter.json");
    await boot();
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
    await rm(configDir, { recursive: true, force: true });
  });

  it("reports missing config status with defaults", async () => {
    const res = await request("/config");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("missing");
    expect(body.data.config).toBeNull();
    expect(body.data.defaults).toBeTruthy();
  });

  it("returns the saved config when valid", async () => {
    const put = await request("/config", {
      method: "PUT",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    expect(put.status).toBe(200);
    const res = await request("/config");
    const body = await res.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.path).toBe(configPath);
    expect(body.data.config.title.exclude).toEqual(["analyst"]);
  });

  it("rejects an invalid config with 400 and leaves the file unchanged", async () => {
    await writeFile(configPath, '{"original":true}\n', "utf8");
    const res = await request("/config", {
      method: "PUT",
      body: JSON.stringify({ config: { enabled: "yes" } }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toContain("enabled");
    expect(await readFile(configPath, "utf8")).toBe('{"original":true}\n');
  });

  it("previews rules on the unscored backlog", async () => {
    const res = await request("/preview", {
      method: "POST",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.counts).toEqual({ drop: 0, keep: 0, undecided: 0 });
  });

  it("rejects an invalid preview draft with 400", async () => {
    const res = await request("/preview", {
      method: "POST",
      body: JSON.stringify({ config: { enabled: "yes" } }),
    });
    expect(res.status).toBe(400);
  });

  it("lists filtered jobs", async () => {
    const res = await request("/jobs");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.jobs).toEqual([]);
  });

  it("returns 404 when restoring an unknown job", async () => {
    const res = await request("/jobs/does-not-exist/restore", {
      method: "POST",
    });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("refuses to score the backlog when config is missing", async () => {
    const { runPipeline } = await import("@server/pipeline/index");
    const res = await request("/score-backlog", { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("starts a backlog-only run (mocked pipeline) when config is valid", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG), "utf8");
    const { runPipeline } = await import("@server/pipeline/index");
    const res = await request("/score-backlog", { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ started: true });
    expect(runPipeline).toHaveBeenCalledWith(
      {
        enableCrawling: false,
        enableImporting: false,
        enableAutoTailoring: false,
      },
      { skipPrefilterReview: true },
    );
  });

  it("requires a config body on PUT /config and POST /preview", async () => {
    const put = await request("/config", { method: "PUT", body: "{}" });
    expect(put.status).toBe(400);
    expect((await put.json()).error.message).toBe("config is required");
    const preview = await request("/preview", { method: "POST", body: "{}" });
    expect(preview.status).toBe(400);
    expect((await preview.json()).error.message).toBe("config is required");
  });

  it("returns 409 when a pipeline run is already active", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG), "utf8");
    const { getPipelineStatus, runPipeline } = await import(
      "@server/pipeline/index"
    );
    vi.mocked(getPipelineStatus).mockReturnValue({
      isRunning: true,
    } as ReturnType<typeof getPipelineStatus>);
    const res = await request("/score-backlog", { method: "POST" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("refuses to score the backlog when the config is invalid", async () => {
    await writeFile(configPath, '{"enabled":"yes"}', "utf8");
    const { runPipeline } = await import("@server/pipeline/index");
    const res = await request("/score-backlog", { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.message).toContain("invalid");
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("restores a filtered job back to discovered", async () => {
    const job = await seedJob("Data Analyst", "https://example.com/a");
    const { markJobFiltered } = await import("@server/repositories/prefilter");
    const { getJobById } = await import("@server/repositories/jobs");
    expect(
      await markJobFiltered({ id: job.id, layer: "rules", reason: "title" }),
    ).toBe(true);

    const list = await (await request("/jobs")).json();
    expect(list.data.jobs.map((j: { id: string }) => j.id)).toEqual([job.id]);

    const res = await request(`/jobs/${job.id}/restore`, { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: job.id, restored: true });
    const after = await getJobById(job.id);
    expect(after?.status).toBe("discovered");
    expect(after?.filterLayer).toBe("restored");
  });

  it("excludes restored jobs from the preview backlog", async () => {
    const normal = await seedJob("Product Manager", "https://example.com/n");
    const restored = await seedJob("Data Analyst", "https://example.com/r");
    const { markJobFiltered, restoreFilteredJob } = await import(
      "@server/repositories/prefilter"
    );
    await markJobFiltered({ id: restored.id, layer: "rules", reason: "t" });
    await restoreFilteredJob(restored.id);

    const res = await request("/preview", {
      method: "POST",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    const total =
      body.data.counts.drop +
      body.data.counts.keep +
      body.data.counts.undecided;
    expect(total).toBe(1);
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([
      normal.id,
    ]);
  });

  it("excludes manually added jobs from the preview backlog", async () => {
    const normal = await seedJob("Product Manager", "https://example.com/n");
    await seedJob("Data Analyst", "https://example.com/m", "manual");
    const res = await request("/preview", {
      method: "POST",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([
      normal.id,
    ]);
  });

  it("blocks config saves and restores in demo mode", async () => {
    await stopServer({ server, closeDb, tempDir });
    await boot({ DEMO_MODE: "true" });
    const put = await request("/config", {
      method: "PUT",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    expect(put.status).toBe(403);
    await expect(readFile(configPath, "utf8")).rejects.toThrow();
    const restore = await request("/jobs/whatever/restore", {
      method: "POST",
    });
    expect(restore.status).toBe(403);
  });

  it("blocks backlog scoring in demo mode", async () => {
    await stopServer({ server, closeDb, tempDir });
    await boot({ DEMO_MODE: "true" });
    await writeFile(configPath, JSON.stringify(VALID_CONFIG), "utf8");
    const { runPipeline } = await import("@server/pipeline/index");
    const res = await request("/score-backlog", { method: "POST" });
    expect(res.status).toBe(403);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("disables the whole router in hosted mode", async () => {
    await stopServer({ server, closeDb, tempDir });
    await boot({
      JOBOPS_APP_MODE: "hosted",
      JOBOPS_HOSTED_TENANT_ID: "tenant_default",
    });
    for (const [path, init] of [
      ["/config", undefined],
      ["/jobs", undefined],
      ["/score-backlog", { method: "POST" }],
    ] as const) {
      const res = await request(path, init);
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toBe(
        "Pre-score filter is unavailable in hosted mode.",
      );
    }
  });

  it("re-checks scored jobs with the saved rules: lists first, moves on apply", async () => {
    await request("/config", {
      method: "PUT",
      body: JSON.stringify({ config: VALID_CONFIG }),
    });
    const { updateJob, getJobById } = await import("@server/repositories/jobs");
    const analyst = await seedJob("Data Analyst", "https://example.com/s1");
    const pm = await seedJob("Product Manager", "https://example.com/s2");
    const unscored = await seedJob("Data Analyst", "https://example.com/s3");
    await updateJob(analyst.id, {
      suitabilityScore: 40,
      suitabilityReason: "meh",
      location: "Waterloo, ON",
    });
    await updateJob(pm.id, { suitabilityScore: 80, location: "Waterloo, ON" });

    const dry = await (
      await request("/recheck-scored", { method: "POST", body: "{}" })
    ).json();
    expect(dry.data.checked).toBe(2);
    expect(dry.data.moved).toBe(0);
    expect(dry.data.drops.map((d: { id: string }) => d.id)).toEqual([
      analyst.id,
    ]);
    expect((await getJobById(analyst.id))?.status).toBe("discovered");

    const applied = await (
      await request("/recheck-scored", {
        method: "POST",
        body: JSON.stringify({ apply: true }),
      })
    ).json();
    expect(applied.data.moved).toBe(1);
    const after = await getJobById(analyst.id);
    expect(after?.status).toBe("skipped");
    expect(after?.suitabilityReason).toBe("meh");
    expect((await getJobById(unscored.id))?.status).toBe("discovered");
    expect((await getJobById(pm.id))?.status).toBe("discovered");
  });

  it("saves a skip reason for a skipped job and 404s otherwise", async () => {
    const job = await seedJob("Product Manager", "https://example.com/k");
    const missing = await request(`/jobs/${job.id}/skip-reason`, {
      method: "PUT",
      body: JSON.stringify({ reason: "too junior" }),
    });
    expect(missing.status).toBe(404);
    const { updateJob, getJobById } = await import("@server/repositories/jobs");
    await updateJob(job.id, { status: "skipped" });
    const res = await request(`/jobs/${job.id}/skip-reason`, {
      method: "PUT",
      body: JSON.stringify({ reason: "  too junior  " }),
    });
    expect(res.status).toBe(200);
    expect((await getJobById(job.id))?.skipReason).toBe("too junior");
  });
});

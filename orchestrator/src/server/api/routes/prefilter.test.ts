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

  beforeEach(async () => {
    vi.clearAllMocks();
    configDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-cfg-"));
    configPath = join(configDir, "prefilter.json");
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { PREFILTER_CONFIG_PATH: configPath },
    }));
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
});

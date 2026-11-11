import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Spend API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  const request = (path: string, init?: RequestInit) =>
    fetch(`${baseUrl}/api/spend${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  const seed = async () => {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { recordLlmUsage } = await import("@server/services/llm/usage");
    const { runWithRequestContext } = await import("@infra/request-context");

    const applied = await createJob({
      source: "linkedin",
      title: "Product Manager",
      employer: "Acme",
      jobUrl: "https://example.com/a",
      jobDescription: "desc",
    });
    await updateJob(applied.id, { status: "applied" });
    const skipped = await createJob({
      source: "linkedin",
      title: "Data Analyst",
      employer: "Beta",
      jobUrl: "https://example.com/b",
      jobDescription: "desc",
    });

    const tokens = (input: number, output: number) => ({
      inputTokens: input,
      outputTokens: output,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });

    runWithRequestContext({ pipelineRunId: "run-1" }, () => {
      // Haiku 5.5: $0.10 in / $0.50 out per million.
      recordLlmUsage({
        provider: "anthropic",
        model: "claude-haiku-5-5",
        feature: "scoring",
        jobId: applied.id,
        usage: tokens(1_000_000, 0),
        success: true,
      });
      recordLlmUsage({
        provider: "anthropic",
        model: "claude-haiku-5-5",
        feature: "scoring",
        jobId: skipped.id,
        usage: tokens(0, 1_000_000),
        success: true,
      });
      recordLlmUsage({
        provider: "anthropic",
        model: "claude-haiku-5-5",
        feature: "title_check",
        usage: tokens(2_000_000, 0),
        success: true,
      });
    });
    recordLlmUsage({
      provider: "anthropic",
      model: "claude-haiku-5-5",
      feature: "tailoring",
      jobId: applied.id,
      usage: tokens(0, 2_000_000),
      success: true,
    });
    recordLlmUsage({
      provider: "openrouter",
      model: "mystery-model",
      feature: "search_terms",
      usage: tokens(500, 500),
      success: true,
    });
    return { applied, skipped };
  };

  it("prices and groups recorded usage", async () => {
    const { applied, skipped } = await seed();
    const res = await request("?tz=America/Toronto");
    const body = await res.json();
    expect(res.status).toBe(200);
    const report = body.data;

    // 0.10 + 0.50 + 0.20 + 1.00 = 1.80; the unpriced model counts as 0.
    expect(report.totals.cost).toBeCloseTo(1.8, 6);
    expect(report.totals.calls).toBe(5);
    expect(report.unpricedModels).toEqual(["mystery-model"]);

    const byFeature = Object.fromEntries(
      report.byFeature.map((f: { feature: string; cost: number }) => [
        f.feature,
        f.cost,
      ]),
    );
    expect(byFeature.scoring).toBeCloseTo(0.6, 6);
    expect(byFeature.tailoring).toBeCloseTo(1.0, 6);

    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]).toMatchObject({ runId: "run-1", jobsTouched: 2 });
    expect(report.runs[0].cost).toBeCloseTo(0.8, 6);

    const appliedRow = report.jobs.find(
      (j: { jobId: string }) => j.jobId === applied.id,
    );
    expect(appliedRow).toMatchObject({
      title: "Product Manager",
      status: "applied",
    });
    expect(appliedRow.cost).toBeCloseTo(1.1, 6);
    const skippedRow = report.jobs.find(
      (j: { jobId: string }) => j.jobId === skipped.id,
    );
    expect(skippedRow.cost).toBeCloseTo(0.5, 6);
    // Most expensive job first.
    expect(report.jobs[0].jobId).toBe(applied.id);

    expect(report.unattributed.calls).toBe(1);
    expect(report.trackingSince).toEqual(expect.any(String));
  });

  it("filters by date range", async () => {
    await seed();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request(`?from=${encodeURIComponent(future)}`);
    const body = await res.json();
    expect(body.data.totals.calls).toBe(0);
  });

  it("returns cost per run for the run list", async () => {
    await seed();
    const res = await request("/runs?ids=run-1,run-unknown");
    const body = await res.json();
    expect(body.data.costs["run-1"]).toBeCloseTo(0.8, 6);
    expect(body.data.costs["run-unknown"]).toBeUndefined();
  });

  it("saves price edits and re-prices history", async () => {
    await seed();
    const pricing = await (await request("/pricing")).json();
    expect(pricing.data.seenModels).toContain("mystery-model");
    expect(pricing.data.models["claude-haiku-5-5"].input).toBe(0.1);

    const save = await request("/pricing", {
      method: "PUT",
      body: JSON.stringify({
        models: {
          ...pricing.data.models,
          "mystery-model": {
            input: 1000,
            output: 1000,
            cacheWrite: 0,
            cacheRead: 0,
          },
        },
      }),
    });
    expect(save.status).toBe(200);
    const saved = await save.json();
    // Untouched defaults aren't stored as overrides.
    expect(saved.data.customized).toEqual(["mystery-model"]);

    const report = (await (await request("")).json()).data;
    expect(report.unpricedModels).toEqual([]);
    // 1000 tokens at $1000/M = $1.00 on top of $1.80.
    expect(report.totals.cost).toBeCloseTo(2.8, 6);
  });

  it("rejects negative prices", async () => {
    const res = await request("/pricing", {
      method: "PUT",
      body: JSON.stringify({
        models: { x: { input: -1, output: 0, cacheWrite: 0, cacheRead: 0 } },
      }),
    });
    expect(res.status).toBe(400);
  });
});

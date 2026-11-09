import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-prefilter-gate-1",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
  })),
  updatePipelineRun: vi.fn(async () => undefined),
}));

const discoverJobsStep = vi.fn(async () => ({
  discoveredJobs: [],
  sourceErrors: [],
  pendingChallenges: [],
}));
const scoreJobsStep = vi.fn(async () => ({
  unprocessedJobs: [],
  scoredJobs: [],
}));
const selectJobsStep = vi.fn(() => []);

vi.mock("./steps", () => ({
  loadProfileStep: vi.fn(async () => ({})),
  discoverJobsStep,
  importJobsStep: vi.fn(async () => ({
    created: 0,
    skipped: 0,
    fuzzyMerged: 0,
  })),
  scoreJobsStep,
  selectJobsStep,
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

describe.sequential("pipeline prefilter gate", () => {
  let tempDir: string;
  const originalConfigPath = process.env.PREFILTER_CONFIG_PATH;

  async function writeConfig(raw: unknown | string) {
    const file = join(tempDir, "prefilter.json");
    await writeFile(file, typeof raw === "string" ? raw : JSON.stringify(raw));
    process.env.PREFILTER_CONFIG_PATH = file;
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-gate-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    await import("../db/migrate");
  });

  afterEach(async () => {
    if (originalConfigPath === undefined)
      delete process.env.PREFILTER_CONFIG_PATH;
    else process.env.PREFILTER_CONFIG_PATH = originalConfigPath;
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("pauses before scoring until resumed", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(getProgress().actionTitle).toBe(
      "Review filter rules before scoring",
    );
    expect(scoreJobsStep).not.toHaveBeenCalled();

    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });
    const result = await runPromise;
    expect(result.success).toBe(true);
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
    expect(getProgress().actionTitle).toBeUndefined();
  });

  it("pauses on an invalid config instead of scoring everything", async () => {
    await writeConfig("{ broken");
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().actionTitle).toBe(
        "Pre-score filter needs attention",
      );
    });
    expect(scoreJobsStep).not.toHaveBeenCalled();

    await writeConfig({ pauseBeforeScoring: false });
    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });
    expect((await runPromise).success).toBe(true);
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled while paused", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(pipeline.requestPipelineCancel().accepted).toBe(true);
    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(scoreJobsStep).not.toHaveBeenCalled();
  });

  it("backlog mode skips discovery, the pause and tailoring", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");

    const result = await pipeline.runPipeline(
      {
        enableCrawling: false,
        enableImporting: false,
        enableAutoTailoring: false,
      },
      { skipPrefilterReview: true },
    );

    expect(result.success).toBe(true);
    expect(discoverJobsStep).not.toHaveBeenCalled();
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
    expect(selectJobsStep).not.toHaveBeenCalled();
  });
});

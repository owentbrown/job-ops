import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("prefilter repository", () => {
  let tempDir: string;
  let jobsRepo: Awaited<typeof import("./jobs")>;
  let prefilterRepo: Awaited<typeof import("./prefilter")>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-repo-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    await import("../db/migrate");
    jobsRepo = await import("./jobs");
    prefilterRepo = await import("./prefilter");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function makeJob(suffix: string) {
    return jobsRepo.createJob({
      source: "manual",
      title: `Business Analyst ${suffix}`,
      employer: "Acme",
      jobUrl: `https://example.com/job/${suffix}`,
    });
  }

  it("marks a discovered job as filtered with audit fields", async () => {
    const job = await makeJob("a");
    const changed = await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "rules",
      reason: "title keyword 'analyst'",
    });
    expect(changed).toBe(true);

    const updated = await jobsRepo.getJobById(job.id);
    expect(updated?.status).toBe("skipped");
    expect(updated?.filterLayer).toBe("rules");
    expect(updated?.filterReason).toBe("title keyword 'analyst'");
    expect(updated?.filteredAt).toEqual(expect.any(String));
    expect(updated?.suitabilityReason).toBe(
      "Filtered (rules): title keyword 'analyst'",
    );
    expect(updated?.suitabilityScore).toBeNull();
  });

  it("does not filter a job that is no longer discovered", async () => {
    const job = await makeJob("b");
    await jobsRepo.updateJob(job.id, { status: "applied" });
    const changed = await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "llm",
      reason: "irrelevant",
    });
    expect(changed).toBe(false);
    expect((await jobsRepo.getJobById(job.id))?.status).toBe("applied");
  });

  it("lists filtered jobs and restores one", async () => {
    const a = await makeJob("c");
    const b = await makeJob("d");
    await prefilterRepo.markJobFiltered({
      id: a.id,
      layer: "rules",
      reason: "r1",
    });
    await prefilterRepo.markJobFiltered({
      id: b.id,
      layer: "llm",
      reason: "r2",
    });

    const listed = await prefilterRepo.listFilteredJobs();
    expect(listed.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());

    expect(await prefilterRepo.restoreFilteredJob(a.id)).toBe(true);
    const restored = await jobsRepo.getJobById(a.id);
    expect(restored?.status).toBe("discovered");
    expect(restored?.filterLayer).toBe("restored");
    expect(restored?.filterReason).toBe("r1");
    expect(restored?.suitabilityReason).toBeNull();

    const listedAfter = await prefilterRepo.listFilteredJobs();
    expect(listedAfter.map((j) => j.id)).toEqual([b.id]);

    expect(await prefilterRepo.restoreFilteredJob(a.id)).toBe(false);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("jobs repository viewed state", () => {
  let tempDir: string;
  let jobsRepo: Awaited<typeof import("./jobs")>;

  const boot = async () => {
    vi.resetModules();
    await import("../db/migrate");
    jobsRepo = await import("./jobs");
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-job-viewed-repo-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    await boot();
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("starts new, keeps the first open, and survives a restart", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Product Manager",
      employer: "Acme",
      jobUrl: "https://example.com/job/viewed",
    });
    const listed = async () =>
      (await jobsRepo.getJobListItems()).find((j) => j.id === job.id);

    expect((await listed())?.viewedAt).toBeNull();

    expect(await jobsRepo.markJobViewed(job.id)).toBe(true);
    const first = await listed();
    expect(first?.viewedAt).toEqual(expect.any(String));
    expect(first?.updatedAt).toBe(job.updatedAt);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await jobsRepo.markJobViewed(job.id);
    expect((await listed())?.viewedAt).toBe(first?.viewedAt);

    expect(await jobsRepo.markJobViewed("missing")).toBe(false);

    const { closeDb } = await import("../db/index");
    closeDb();
    await boot();
    expect((await listed())?.viewedAt).toBe(first?.viewedAt);
  });
});

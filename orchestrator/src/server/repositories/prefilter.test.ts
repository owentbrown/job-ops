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

  it("never re-filters a restored job", async () => {
    const job = await makeJob("e");
    await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "rules",
      reason: "r",
    });
    await prefilterRepo.restoreFilteredJob(job.id);
    const changed = await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "llm",
      reason: "again",
    });
    expect(changed).toBe(false);
    const after = await jobsRepo.getJobById(job.id);
    expect(after?.status).toBe("discovered");
    expect(after?.filterLayer).toBe("restored");
  });

  it("does not restore a skipped job that was never filtered", async () => {
    const job = await makeJob("f");
    await jobsRepo.updateJob(job.id, { status: "skipped" });
    expect(await prefilterRepo.restoreFilteredJob(job.id)).toBe(false);
    expect((await jobsRepo.getJobById(job.id))?.status).toBe("skipped");
  });

  it("isolates filtered jobs between tenants", async () => {
    const { runWithRequestContext } = await import("@infra/request-context");
    const inTenant = <T>(tenantId: string, run: () => Promise<T>) =>
      runWithRequestContext({ requestId: `test-${tenantId}`, tenantId }, run);

    const { db, schema } = await import("../db/index");
    await db
      .insert(schema.tenants)
      .values({ id: "tenant-b", name: "Tenant B", slug: "tenant-b" });

    const other = await inTenant("tenant-b", () => makeJob("g"));
    expect(
      await prefilterRepo.markJobFiltered({
        id: other.id,
        layer: "rules",
        reason: "x",
      }),
    ).toBe(false);

    await inTenant("tenant-b", () =>
      prefilterRepo.markJobFiltered({
        id: other.id,
        layer: "rules",
        reason: "x",
      }),
    );
    expect(await prefilterRepo.listFilteredJobs()).toEqual([]);
    expect(await prefilterRepo.restoreFilteredJob(other.id)).toBe(false);
    expect(
      (await inTenant("tenant-b", () => prefilterRepo.listFilteredJobs())).map(
        (j) => j.id,
      ),
    ).toEqual([other.id]);
  });

  it("keeps a scored job's reason when filtering and restoring it", async () => {
    const job = await makeJob("scored");
    await jobsRepo.updateJob(job.id, {
      suitabilityScore: 70,
      suitabilityReason: "Strong product fit",
    });
    await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "rules",
      reason: "US-only location",
    });
    const filtered = await jobsRepo.getJobById(job.id);
    expect(filtered?.status).toBe("skipped");
    expect(filtered?.suitabilityReason).toBe("Strong product fit");

    await prefilterRepo.restoreFilteredJob(job.id);
    const restored = await jobsRepo.getJobById(job.id);
    expect(restored?.status).toBe("discovered");
    expect(restored?.suitabilityScore).toBe(70);
    expect(restored?.suitabilityReason).toBe("Strong product fit");
  });

  it("clears the filter reason on restore of an unscored job", async () => {
    const job = await makeJob("unscored");
    await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "rules",
      reason: "title",
    });
    await prefilterRepo.restoreFilteredJob(job.id);
    expect((await jobsRepo.getJobById(job.id))?.suitabilityReason).toBeNull();
  });

  it("saves a skip reason only on skipped jobs", async () => {
    const job = await makeJob("skip");
    expect(await prefilterRepo.setSkipReason(job.id, "3 days in office")).toBe(
      false,
    );
    await jobsRepo.updateJob(job.id, { status: "skipped" });
    expect(await prefilterRepo.setSkipReason(job.id, "3 days in office")).toBe(
      true,
    );
    expect((await jobsRepo.getJobById(job.id))?.skipReason).toBe(
      "3 days in office",
    );
  });
});

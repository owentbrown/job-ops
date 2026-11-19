import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("getTitleEmployerPairsSince", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-repost-pairs-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    vi.resetModules();
    await import("../db/migrate");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("includes applied jobs however long ago they were found", async () => {
    const jobsRepo = await import("./jobs");
    const { db, schema } = await import("../db/index");
    const { eq } = await import("drizzle-orm");
    const old = "2025-01-01T00:00:00.000Z";

    const applied = await jobsRepo.createJob({
      source: "manual",
      title: "Old Applied Role",
      employer: "Acme",
      jobUrl: "https://example.com/applied",
    });
    const skipped = await jobsRepo.createJob({
      source: "manual",
      title: "Old Unapplied Role",
      employer: "Acme",
      jobUrl: "https://example.com/old",
    });
    await db
      .update(schema.jobs)
      .set({ discoveredAt: old, appliedAt: old, status: "applied" })
      .where(eq(schema.jobs.id, applied.id));
    await db
      .update(schema.jobs)
      .set({ discoveredAt: old })
      .where(eq(schema.jobs.id, skipped.id));

    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const titles = (await jobsRepo.getTitleEmployerPairsSince(since)).map(
      (row) => row.title,
    );
    expect(titles).toContain("Old Applied Role");
    expect(titles).not.toContain("Old Unapplied Role");
  });
});

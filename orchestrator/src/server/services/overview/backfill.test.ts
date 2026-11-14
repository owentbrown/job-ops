import type { Server } from "node:http";
import { startServer, stopServer } from "@server/api/routes/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeDeps = (
  answer: (ids: string[]) => Record<string, string>,
  success = true,
) => ({
  createService: async () => ({
    callJson: vi.fn(
      async ({ messages }: { messages: { content: string }[] }) => {
        const content = messages.at(-1)?.content ?? "";
        const ids = [...content.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1]);
        if (!success) return { success: false, error: "boom" };
        const picked = answer(ids);
        return {
          success: true,
          data: { results: ids.map((id) => ({ id, category: picked[id] })) },
        };
      },
    ) as any,
  }),
  resolveModel: async () => "test-model",
  getSearchTerms: async () => ["growth manager"],
});

describe.sequential("overview backfill", () => {
  let server: Server;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, closeDb, tempDir } = await startServer());
  });
  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function seed(
    title: string,
    update: Record<string, unknown>,
  ): Promise<string> {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const job = await createJob({
      source: "manual",
      title,
      employer: "Acme",
      jobUrl: `https://example.com/${encodeURIComponent(title)}`,
      jobDescription: "d",
    });
    await updateJob(job.id, update as any);
    return job.id;
  }

  it("estimates and fills role categories for applied jobs once", async () => {
    const { estimateBackfill, runBackfill } = await import("./backfill");
    const { getJobById } = await import("@server/repositories/jobs");
    const now = new Date().toISOString();
    const a = await seed("Growth Lead", { status: "applied", appliedAt: now });
    const b = await seed("Astronaut", { status: "applied", appliedAt: now });
    const c = await seed("Done", {
      status: "applied",
      appliedAt: now,
      roleCategory: "growth manager",
    });
    await seed("Not applied", {});

    const estimate = await estimateBackfill("roles", {
      resolveModel: async () => "unknown-model",
    });
    expect(estimate).toMatchObject({ count: 2, calls: 1, estimatedCost: null });

    const deps = fakeDeps((ids) =>
      Object.fromEntries(
        ids.map((id, i) => [id, i === 0 ? "growth manager" : "nope"]),
      ),
    );
    const result = await runBackfill("roles", deps);
    expect(result).toEqual({ kind: "roles", categorized: 2, failedBatches: 0 });
    expect((await getJobById(a))?.roleCategory).toBe("growth manager");
    expect((await getJobById(b))?.roleCategory).toBe("Other");
    expect((await getJobById(c))?.roleCategory).toBe("growth manager");

    const again = await runBackfill("roles", deps);
    expect(again.categorized).toBe(0);
  });

  it("only sorts the user's own legacy skip notes", async () => {
    const { runBackfill } = await import("./backfill");
    const { getJobById } = await import("@server/repositories/jobs");
    const legacy = await seed("Legacy", {
      status: "skipped",
      skipReason: "they want 5 days in office",
    } as any);
    const language = await seed("Lang", {
      status: "skipped",
      skipReason: "Needs French (required)",
    } as any);
    const filtered = await seed("Filtered", {
      status: "skipped",
      skipReason: "too far",
      filterLayer: "rules",
    } as any);

    const result = await runBackfill(
      "skips",
      fakeDeps((ids) =>
        Object.fromEntries(ids.map((id) => [id, "Location / remote"])),
      ),
    );
    expect(result.categorized).toBe(1);
    expect((await getJobById(legacy))?.skipCategory).toBe("Location / remote");
    expect((await getJobById(language))?.skipCategory).toBeNull();
    expect((await getJobById(filtered))?.skipCategory).toBeNull();
  });

  it("counts a failed batch and leaves its rows empty", async () => {
    const { runBackfill } = await import("./backfill");
    const { getJobById } = await import("@server/repositories/jobs");
    const id = await seed("Growth Lead", {
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
    const result = await runBackfill(
      "roles",
      fakeDeps(() => ({}), false),
    );
    expect(result).toEqual({ kind: "roles", categorized: 0, failedBatches: 1 });
    expect((await getJobById(id))?.roleCategory).toBeNull();
  });
});

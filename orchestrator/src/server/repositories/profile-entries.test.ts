import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const story = {
  title: "Pricing relaunch",
  themes: ["delivery", "analytics"],
  situation: "Churn was rising",
  task: "Redesign pricing",
  action: "Ran tests and shipped tiers",
  result: "ARPU up 12%",
  metric: "+12% ARPU",
  source: "manual",
} as const;

const brand = { line: "Product leader", industries: ["SaaS"] };

function scope(tenantId: string, userId: string | null, hosted: boolean) {
  return {
    tenantId,
    userId,
    enforceUserIsolation: hosted,
    scopeKey: userId ? `${tenantId}:${userId}` : tenantId,
  };
}

describe.sequential("profile-entries repository", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let closeDb: (() => void) | null = null;
  let dbModule: typeof import("../db");

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-profile-entries-"));
    process.env = { ...originalEnv, DATA_DIR: tempDir, NODE_ENV: "test" };
    await import("../db/migrate");
    dbModule = await import("../db");
    closeDb = dbModule.closeDb;
    const { db, schema } = dbModule;
    await db.insert(schema.tenants).values({
      id: "tenant_b",
      name: "B",
      slug: "b",
    });
    await db.insert(schema.users).values([
      { id: "user_1", username: "one" },
      { id: "user_2", username: "two" },
    ]);
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  const local = scope("tenant_default", null, false);

  it("creates, lists, updates and deletes stories", async () => {
    const repo = await import("./profile-entries");
    const created = await repo.createStory(story, local);
    expect(created.kind).toBe("story");

    let list = await repo.listEntries(local);
    expect(list).toHaveLength(1);
    expect(list[0]?.data).toMatchObject({ title: "Pricing relaunch" });

    const updated = await repo.updateStory(
      created.id,
      { ...story, title: "Renamed" },
      local,
    );
    expect(updated?.data.title).toBe("Renamed");

    expect(await repo.deleteStory(created.id, local)).toBe(true);
    expect(await repo.deleteStory(created.id, local)).toBe(false);
    expect(await repo.updateStory(created.id, story, local)).toBeNull();
    list = await repo.listEntries(local);
    expect(list).toHaveLength(0);
  });

  it("rejects invalid data", async () => {
    const repo = await import("./profile-entries");
    await expect(
      repo.createStory({ ...story, themes: ["nope"] }, local),
    ).rejects.toThrow();
    await expect(
      repo.upsertSingleton("brand", { line: 3 }, local),
    ).rejects.toThrow();
    expect(await repo.listEntries(local)).toHaveLength(0);
  });

  it("upserts a singleton in place", async () => {
    const repo = await import("./profile-entries");
    expect(await repo.getSingleton("brand", local)).toBeNull();
    const first = await repo.upsertSingleton("brand", brand, local);
    const second = await repo.upsertSingleton(
      "brand",
      { line: "Changed", industries: [] },
      local,
    );
    expect(second.id).toBe(first.id);
    const list = await repo.listEntries(local);
    expect(list).toHaveLength(1);
    expect((await repo.getSingleton("brand", local))?.data).toEqual({
      line: "Changed",
      industries: [],
    });
  });

  it("isolates tenants", async () => {
    const repo = await import("./profile-entries");
    const other = scope("tenant_b", null, false);
    const s = await repo.createStory(story, local);
    await repo.upsertSingleton("brand", brand, local);

    expect(await repo.listEntries(other)).toHaveLength(0);
    expect(await repo.getSingleton("brand", other)).toBeNull();
    expect(await repo.updateStory(s.id, story, other)).toBeNull();
    expect(await repo.deleteStory(s.id, other)).toBe(false);
    expect(await repo.listEntries(local)).toHaveLength(2);
  });

  it("isolates users when hosted isolation is on", async () => {
    const repo = await import("./profile-entries");
    const u1 = scope("tenant_default", "user_1", true);
    const u2 = scope("tenant_default", "user_2", true);
    const s = await repo.createStory(story, u1);
    await repo.upsertSingleton("brand", brand, u1);
    await repo.upsertSingleton("brand", { line: "Two", industries: [] }, u2);

    expect(await repo.listEntries(u1)).toHaveLength(2);
    expect(await repo.listEntries(u2)).toHaveLength(1);
    expect((await repo.getSingleton("brand", u2))?.data).toMatchObject({
      line: "Two",
    });
    expect(await repo.deleteStory(s.id, u2)).toBe(false);
    expect(await repo.deleteStory(s.id, u1)).toBe(true);
  });

  it("does not let updateStory or deleteStory touch non-story rows", async () => {
    const repo = await import("./profile-entries");
    const b = await repo.upsertSingleton("brand", brand, local);
    expect(await repo.updateStory(b.id, story, local)).toBeNull();
    expect(await repo.deleteStory(b.id, local)).toBe(false);
    expect(await repo.getSingleton("brand", local)).not.toBeNull();
  });

  it("migration is idempotent and keeps rows across re-runs", async () => {
    const repo = await import("./profile-entries");
    await repo.upsertSingleton("brand", brand, local);
    vi.resetModules();
    closeDb?.();
    await import("../db/migrate");
    dbModule = await import("../db");
    closeDb = dbModule.closeDb;
    const repo2 = await import("./profile-entries");
    expect(await repo2.listEntries(local)).toHaveLength(1);
  });
});

import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getDataDir", () => {
  const originalCwd = process.cwd();
  const originalDataDir = process.env.DATA_DIR;
  let tempDir: string | null = null;

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    vi.resetModules();
  });

  it("publishes the resolved fallback as DATA_DIR", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-data-dir-"));
    const dataDir = join(tempDir, "data");
    await mkdir(dataDir);
    process.chdir(tempDir);
    delete process.env.DATA_DIR;
    vi.resetModules();

    const { getDataDir } = await import("./dataDir");
    const expectedDataDir = await realpath(dataDir);

    expect(getDataDir()).toBe(expectedDataDir);
    expect(process.env.DATA_DIR).toBe(expectedDataDir);
  });
});

describe("getDatabasePath", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalDbPath = process.env.DATABASE_PATH;

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDbPath;
  });

  it("defaults to jobs.db in the data folder", async () => {
    process.env.DATA_DIR = "/tmp/jobops-data";
    delete process.env.DATABASE_PATH;
    const { getDatabasePath } = await import("./dataDir");
    expect(getDatabasePath()).toBe(join("/tmp/jobops-data", "jobs.db"));
  });

  it("uses DATABASE_PATH when set (Docker volume)", async () => {
    process.env.DATA_DIR = "/tmp/jobops-data";
    process.env.DATABASE_PATH = "/app/db/jobs.db";
    const { getDatabasePath } = await import("./dataDir");
    expect(getDatabasePath()).toBe("/app/db/jobs.db");
  });
});

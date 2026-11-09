import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePrefilterConfig,
  readPrefilterConfig,
  writePrefilterConfig,
} from "./config";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("parsePrefilterConfig", () => {
  it("applies defaults for an empty object", () => {
    const config = parsePrefilterConfig({});
    expect(config.enabled).toBe(true);
    expect(config.pauseBeforeScoring).toBe(true);
    expect(config.title.include).toEqual([]);
    expect(config.salary.floorAnnualCad).toBe(110000);
    expect(config.salary.hoursPerYear).toBe(2080);
    expect(config.salary.defaultCurrency).toBe("CAD");
    expect(config.llm.enabled).toBe(false);
    expect(config.llm.batchSize).toBe(20);
    expect(config.llm.descriptionChars).toBe(400);
  });

  it("rejects unknown keys so typos are caught", () => {
    expect(() => parsePrefilterConfig({ titel: {} })).toThrow();
  });

  it("allows _comment keys", () => {
    expect(() =>
      parsePrefilterConfig({ _comment: "notes", title: { _comment: "x" } }),
    ).not.toThrow();
  });
});

describe("readPrefilterConfig / writePrefilterConfig", () => {
  const originalPath = process.env.PREFILTER_CONFIG_PATH;
  let dir: string | null = null;

  async function tempFile(contents?: string): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "prefilter-config-"));
    const file = join(dir, "prefilter.json");
    if (contents !== undefined) await writeFile(file, contents);
    process.env.PREFILTER_CONFIG_PATH = file;
    return file;
  }

  afterEach(async () => {
    if (originalPath === undefined) delete process.env.PREFILTER_CONFIG_PATH;
    else process.env.PREFILTER_CONFIG_PATH = originalPath;
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("is off under test when no explicit path is set", async () => {
    delete process.env.PREFILTER_CONFIG_PATH;
    expect(await readPrefilterConfig()).toEqual({ status: "off-in-tests" });
  });

  it("loads and validates the file at PREFILTER_CONFIG_PATH", async () => {
    const file = await tempFile(
      JSON.stringify({ title: { exclude: ["analyst"] } }),
    );
    const load = await readPrefilterConfig();
    expect(load.status).toBe("ok");
    expect(load.status === "ok" && load.config.title.exclude).toEqual([
      "analyst",
    ]);
    expect(load.status === "ok" && load.path).toBe(file);
  });

  it("reports a missing file", async () => {
    const file = await tempFile();
    expect(await readPrefilterConfig()).toEqual({
      status: "missing",
      path: file,
    });
  });

  it("reports invalid JSON and schema errors with a readable message", async () => {
    await tempFile("{ not json");
    expect((await readPrefilterConfig()).status).toBe("invalid");

    await tempFile(JSON.stringify({ titel: {} }));
    const load = await readPrefilterConfig();
    expect(load.status).toBe("invalid");
    expect(load.status === "invalid" && load.error).toMatch(/titel/);
  });

  it("writes a validated config atomically and reads it back", async () => {
    const file = await tempFile();
    const saved = await writePrefilterConfig({
      title: { exclude: ["intern"] },
    });
    expect(saved.path).toBe(file);
    expect(saved.config.salary.floorAnnualCad).toBe(110000);
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    expect(onDisk.title.exclude).toEqual(["intern"]);
  });

  it("does not touch the file when the new config is invalid", async () => {
    const file = await tempFile(JSON.stringify({ enabled: true }));
    await expect(writePrefilterConfig({ enabled: "yes" })).rejects.toThrow();
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ enabled: true });
  });

  it("refuses to write under test without an explicit path", async () => {
    delete process.env.PREFILTER_CONFIG_PATH;
    await expect(writePrefilterConfig({})).rejects.toThrow(
      /PREFILTER_CONFIG_PATH/,
    );
  });

  it("the committed config/prefilter.json is valid", async () => {
    process.env.PREFILTER_CONFIG_PATH = resolve(
      __dirname,
      "../../../../../config/prefilter.json",
    );
    const load = await readPrefilterConfig();
    expect(load.status).toBe("ok");
    expect(load.status === "ok" && load.config.llm.enabled).toBe(true);
    expect(load.status === "ok" && load.config.pauseBeforeScoring).toBe(true);
  });
});

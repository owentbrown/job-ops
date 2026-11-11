import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@server/pipeline/index", () => ({
  getPipelineStatus: vi.fn(() => ({ isRunning: false })),
}));

vi.mock("@server/repositories/pipeline", () => ({
  getRecentPipelineRuns: vi.fn(async () => []),
}));

vi.mock("./search-launch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./search-launch")>();
  return { ...actual, launchSearch: vi.fn(async () => ({ simulated: false })) };
});

import * as pipelineIndex from "@server/pipeline/index";
import * as pipelineRepo from "@server/repositories/pipeline";
import { launchSearch } from "./search-launch";
import {
  checkScheduledSearch,
  computeNextRunAt,
  computePreviousRunAt,
  getSearchScheduleFilePath,
  getSearchScheduleStatus,
  isScheduledRunDue,
  recordLastSearch,
  resolveLastSearch,
  runScheduledSearch,
  stopSearchScheduler,
  updateSearchSchedule,
} from "./search-schedule";

describe("computeNextRunAt", () => {
  it("finds today's hour in the given zone when still ahead", () => {
    // 10:00 UTC = 05:00 in Toronto (EST, UTC-5)
    const now = new Date("2026-11-10T10:00:00Z");
    expect(computeNextRunAt(7, "America/Toronto", now).toISOString()).toBe(
      "2026-11-10T12:00:00.000Z",
    );
  });

  it("rolls to tomorrow once the hour has passed", () => {
    const now = new Date("2026-11-10T12:00:00Z"); // exactly 07:00 Toronto
    expect(computeNextRunAt(7, "America/Toronto", now).toISOString()).toBe(
      "2026-11-11T12:00:00.000Z",
    );
  });

  it("follows daylight saving time", () => {
    // Summer: Toronto is UTC-4
    const now = new Date("2026-07-01T00:00:00Z");
    expect(computeNextRunAt(7, "America/Toronto", now).toISOString()).toBe(
      "2026-07-01T11:00:00.000Z",
    );
  });

  it("handles half-hour offset zones", () => {
    // St. John's NST is UTC-3:30, so 07:00 local = 10:30 UTC
    const now = new Date("2026-11-10T00:00:00Z");
    expect(computeNextRunAt(7, "America/St_Johns", now).toISOString()).toBe(
      "2026-11-10T10:30:00.000Z",
    );
  });
});

describe("day-of-week schedules", () => {
  // 2026-11-11 is a Wednesday.
  it("skips to the next allowed weekday", () => {
    const wedMorning = new Date("2026-11-11T10:00:00Z"); // 05:00 Toronto
    // Weekdays: still today.
    expect(
      computeNextRunAt(
        8,
        "America/Toronto",
        wedMorning,
        [1, 2, 3, 4, 5],
      ).toISOString(),
    ).toBe("2026-11-11T13:00:00.000Z");
    // Mondays only: next Monday the 16th.
    expect(
      computeNextRunAt(8, "America/Toronto", wedMorning, [1]).toISOString(),
    ).toBe("2026-11-16T13:00:00.000Z");
  });

  it("weekly catch-up looks back to the last allowed day", () => {
    const wed = new Date("2026-11-11T20:00:00Z");
    expect(
      computePreviousRunAt(8, "America/Toronto", wed, [1]).toISOString(),
    ).toBe("2026-11-09T13:00:00.000Z");
  });

  it("isn't due on a day the schedule skips", () => {
    const state = {
      enabled: true,
      hour: 8,
      timeZone: "America/Toronto",
      days: [1], // Mondays
      activeSince: "2026-11-01T00:00:00.000Z",
      lastScheduledRun: {
        at: "2026-11-09T13:00:30.000Z", // ran Monday
        outcome: "started" as const,
      },
    };
    // Wednesday afternoon: Monday already ran, nothing due.
    expect(isScheduledRunDue(state, new Date("2026-11-11T20:00:00Z"))).toBe(
      false,
    );
    // Following Monday after 8 AM: due.
    expect(isScheduledRunDue(state, new Date("2026-11-16T15:00:00Z"))).toBe(
      true,
    );
  });

  it("saves days and rejects an empty list", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "search-schedule-days-"));
    try {
      const status = await updateSearchSchedule({ days: [5, 1, 3, 1] });
      expect(status.days).toEqual([1, 3, 5]);
      const { updateSearchScheduleSchema } = await import("./search-schedule");
      expect(updateSearchScheduleSchema.safeParse({ days: [] }).success).toBe(
        false,
      );
    } finally {
      stopSearchScheduler();
      rmSync(process.env.DATA_DIR, { recursive: true, force: true });
      delete process.env.DATA_DIR;
    }
  });
});

describe("computePreviousRunAt", () => {
  it("finds today's slot once it has passed", () => {
    const now = new Date("2026-11-10T15:00:00Z"); // 10:00 Toronto
    expect(computePreviousRunAt(7, "America/Toronto", now).toISOString()).toBe(
      "2026-11-10T12:00:00.000Z",
    );
  });

  it("uses yesterday's slot before today's hour", () => {
    const now = new Date("2026-11-10T10:00:00Z"); // 05:00 Toronto
    expect(computePreviousRunAt(7, "America/Toronto", now).toISOString()).toBe(
      "2026-11-09T12:00:00.000Z",
    );
  });
});

describe("isScheduledRunDue (catch-up after sleep)", () => {
  const base = {
    enabled: true,
    hour: 7,
    timeZone: "America/Toronto",
    activeSince: "2026-11-01T00:00:00.000Z",
    lastScheduledRun: {
      at: "2026-11-09T12:00:30.000Z",
      outcome: "started" as const,
    },
  };

  it("is due when the lid was closed through this morning's slot", () => {
    // Laptop opened at 10:30 Toronto; last run was yesterday morning.
    expect(isScheduledRunDue(base, new Date("2026-11-10T15:30:00Z"))).toBe(
      true,
    );
  });

  it("is not due again once today's run happened", () => {
    const ran = {
      ...base,
      lastScheduledRun: {
        at: "2026-11-10T15:31:00.000Z",
        outcome: "started" as const,
      },
    };
    expect(isScheduledRunDue(ran, new Date("2026-11-10T20:00:00Z"))).toBe(
      false,
    );
  });

  it("is not due before today's hour if yesterday already ran", () => {
    expect(isScheduledRunDue(base, new Date("2026-11-10T10:00:00Z"))).toBe(
      false,
    );
  });

  it("ignores slots before the schedule was switched on", () => {
    const fresh = {
      ...base,
      activeSince: "2026-11-10T14:00:00.000Z", // switched on at 09:00 Toronto
      lastScheduledRun: null,
    };
    expect(isScheduledRunDue(fresh, new Date("2026-11-10T15:00:00Z"))).toBe(
      false,
    );
    // ...but tomorrow's slot counts.
    expect(isScheduledRunDue(fresh, new Date("2026-11-11T12:01:00Z"))).toBe(
      true,
    );
  });

  it("is never due when switched off", () => {
    expect(
      isScheduledRunDue(
        { ...base, enabled: false },
        new Date("2026-11-10T15:30:00Z"),
      ),
    ).toBe(false);
  });
});

describe("search schedule state", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "search-schedule-"));
    process.env.DATA_DIR = dir;
    vi.mocked(launchSearch).mockClear();
    vi.mocked(pipelineIndex.getPipelineStatus).mockReturnValue({
      isRunning: false,
    } as ReturnType<typeof pipelineIndex.getPipelineStatus>);
    vi.mocked(pipelineRepo.getRecentPipelineRuns).mockResolvedValue([]);
  });

  afterEach(() => {
    stopSearchScheduler();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("defaults to off with a 40-job cap", async () => {
    const status = await getSearchScheduleStatus();
    expect(status.enabled).toBe(false);
    expect(status.maxJobsToScore).toBe(40);
    expect(status.nextRunAt).toBeNull();
    expect(status.lastSearch.source).toBe("none");
  });

  it("records the last search without freezing the search terms", async () => {
    await recordLastSearch({
      sources: ["indeed", "linkedin"],
      country: "canada",
      searchTerms: ["Product Manager"],
      topN: 15,
    });
    const saved = JSON.parse(readFileSync(getSearchScheduleFilePath(), "utf8"));
    expect(saved.lastSearch.searchTerms).toBeUndefined();
    const last = await resolveLastSearch();
    expect(last.source).toBe("recorded");
    expect(last.request?.sources).toEqual(["indeed", "linkedin"]);
  });

  it("falls back to the newest past run that actually crawled", async () => {
    const intent = {
      selectedCountry: "canada",
      country: "canada",
      cityLocations: ["Kitchener"],
      workplaceTypes: ["remote", "hybrid"],
      geoScope: "selected_plus_remote_worldwide",
      searchScope: "selected_plus_remote_worldwide",
      matchStrictness: "flexible",
      proximity: null,
    };
    vi.mocked(pipelineRepo.getRecentPipelineRuns).mockResolvedValue([
      {
        id: "backlog",
        startedAt: "2026-11-10T02:14:15.386Z",
        jobsDiscovered: 0,
        configSnapshot: {
          topN: 10,
          minSuitabilityScore: 50,
          sources: ["gradcracker", "ukvisajobs"],
          locationIntent: intent,
        },
      },
      {
        id: "real",
        startedAt: "2026-11-09T18:12:15.596Z",
        jobsDiscovered: 553,
        configSnapshot: {
          topN: 15,
          minSuitabilityScore: 60,
          sources: ["indeed", "linkedin", "hiringcafe"],
          locationIntent: intent,
        },
      },
    ] as never);
    const last = await resolveLastSearch();
    expect(last.source).toBe("history");
    expect(last.request).toMatchObject({
      topN: 15,
      sources: ["indeed", "linkedin", "hiringcafe"],
      country: "canada",
      cityLocations: ["Kitchener"],
    });
  });

  it("arms a next run when enabled and clears it when disabled", async () => {
    const on = await updateSearchSchedule({
      enabled: true,
      hour: 7,
      timeZone: "America/Toronto",
      maxJobsToScore: 25,
    });
    expect(on.nextRunAt).not.toBeNull();
    expect(on.maxJobsToScore).toBe(25);
    const off = await updateSearchSchedule({ enabled: false });
    expect(off.nextRunAt).toBeNull();
    expect(off.hour).toBe(7);
  });

  it("scheduled tick launches unattended with the cap", async () => {
    await updateSearchSchedule({ maxJobsToScore: 12 });
    await recordLastSearch({ sources: ["indeed"], country: "canada" });
    await runScheduledSearch();
    expect(launchSearch).toHaveBeenCalledWith(
      expect.objectContaining({ sources: ["indeed"] }),
      { scheduled: { maxJobsToScore: 12 }, dropIncompatibleSources: true },
    );
    const status = await getSearchScheduleStatus();
    expect(status.lastScheduledRun?.outcome).toBe("started");
  });

  it("switching on doesn't fire for a slot already passed today", async () => {
    await recordLastSearch({ sources: ["indeed"] });
    const passed = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour: "numeric",
        hourCycle: "h23",
      }).format(passed),
    );
    await updateSearchSchedule({ enabled: true, hour, timeZone: "UTC" });
    await checkScheduledSearch();
    expect(launchSearch).not.toHaveBeenCalled();
    const saved = JSON.parse(readFileSync(getSearchScheduleFilePath(), "utf8"));
    expect(saved.activeSince).toEqual(expect.any(String));
  });

  it("catch-up check runs a missed search once", async () => {
    await recordLastSearch({ sources: ["indeed"] });
    await updateSearchSchedule({
      enabled: true,
      hour: 7,
      timeZone: "America/Toronto",
    });
    // Pretend the schedule has been on for a week, then the lid opens late.
    const path = getSearchScheduleFilePath();
    const saved = JSON.parse(readFileSync(path, "utf8"));
    saved.activeSince = "2026-11-01T00:00:00.000Z";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, JSON.stringify(saved));
    const lateMorning = new Date("2026-11-10T15:30:00Z");
    await checkScheduledSearch(lateMorning);
    expect(launchSearch).toHaveBeenCalledTimes(1);
    // lastScheduledRun is stamped with the real clock (after the slot), so a
    // second check the same day does nothing.
    await checkScheduledSearch(new Date("2026-11-10T16:00:00Z"));
    expect(launchSearch).toHaveBeenCalledTimes(1);
  });

  it("scheduled tick skips when a search is already running", async () => {
    await recordLastSearch({ sources: ["indeed"] });
    vi.mocked(pipelineIndex.getPipelineStatus).mockReturnValue({
      isRunning: true,
    } as ReturnType<typeof pipelineIndex.getPipelineStatus>);
    await runScheduledSearch();
    expect(launchSearch).not.toHaveBeenCalled();
    expect((await getSearchScheduleStatus()).lastScheduledRun?.outcome).toBe(
      "skipped",
    );
  });

  it("scheduled tick skips when there is nothing to repeat", async () => {
    await runScheduledSearch();
    expect(launchSearch).not.toHaveBeenCalled();
    expect((await getSearchScheduleStatus()).lastScheduledRun?.outcome).toBe(
      "skipped",
    );
  });
});

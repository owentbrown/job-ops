import type { PipelineRun } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  computeSearchWindowHours,
  DEFAULT_SEARCH_WINDOW_HOURS,
  findLastSearchRun,
} from "./search-window";

const now = new Date("2026-11-11T17:00:00Z");

describe("computeSearchWindowHours", () => {
  it("covers the time since yesterday's run plus 12 hours", () => {
    // Last run 24h ago -> 1.5 days.
    expect(computeSearchWindowHours("2026-11-10T17:00:00Z", now)).toBe(36);
  });

  it("stretches after a gap", () => {
    // Last run 2 days ago -> 2.5 days.
    expect(computeSearchWindowHours("2026-11-09T17:00:00Z", now)).toBe(60);
  });

  it("never goes below one day (boards filter by whole days)", () => {
    expect(computeSearchWindowHours("2026-11-11T13:00:00Z", now)).toBe(24);
  });

  it("caps at 7 days, matching the posting-age rule", () => {
    expect(computeSearchWindowHours("2026-10-01T00:00:00Z", now)).toBe(168);
  });

  it("uses 3 days when there's no previous search", () => {
    expect(computeSearchWindowHours(null, now)).toBe(
      DEFAULT_SEARCH_WINDOW_HOURS,
    );
    expect(computeSearchWindowHours("garbage", now)).toBe(
      DEFAULT_SEARCH_WINDOW_HOURS,
    );
  });
});

describe("findLastSearchRun", () => {
  const run = (over: Partial<PipelineRun>) =>
    ({
      id: "r",
      startedAt: "2026-11-11T13:00:00Z",
      status: "completed",
      jobsDiscovered: 10,
      ...over,
    }) as PipelineRun;

  it("ignores running, failed and backlog-only runs", () => {
    const last = findLastSearchRun([
      run({
        id: "running",
        startedAt: "2026-11-11T16:00:00Z",
        status: "running",
      }),
      run({
        id: "backlog",
        startedAt: "2026-11-11T15:00:00Z",
        jobsDiscovered: 0,
      }),
      run({
        id: "failed",
        startedAt: "2026-11-11T14:00:00Z",
        status: "failed",
      }),
      run({ id: "morning" }),
      run({ id: "older", startedAt: "2026-11-10T13:00:00Z" }),
    ]);
    expect(last?.id).toBe("morning");
  });

  it("returns null with no searches", () => {
    expect(findLastSearchRun([])).toBeNull();
  });
});

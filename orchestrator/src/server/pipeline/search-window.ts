/**
 * How far back Indeed / LinkedIn searches look (fork). Each search covers the
 * time since the last completed search plus a 12-hour overlap, so routine
 * runs only fetch fresh postings yet never leave a gap. Posting dates are
 * often day-only, which the overlap absorbs.
 */
import type { PipelineRun } from "@shared/types";

export const SEARCH_WINDOW_OVERLAP_HOURS = 12;
/** Boards like Indeed filter by whole days, so never ask for less than one. */
export const MIN_SEARCH_WINDOW_HOURS = 24;
/** Matches the 7-day posting-age rule: nothing older survives the filter. */
export const MAX_SEARCH_WINDOW_HOURS = 7 * 24;
/** First search, or no completed search to measure from. */
export const DEFAULT_SEARCH_WINDOW_HOURS = 72;

/** The most recent completed run that actually searched job boards. */
export function findLastSearchRun(runs: PipelineRun[]): PipelineRun | null {
  return (
    runs
      .filter((run) => run.status === "completed" && run.jobsDiscovered > 0)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
  );
}

export function computeSearchWindowHours(
  lastSearchStartedAt: string | null,
  now: Date = new Date(),
): number {
  if (!lastSearchStartedAt) return DEFAULT_SEARCH_WINDOW_HOURS;
  const started = Date.parse(lastSearchStartedAt);
  if (Number.isNaN(started)) return DEFAULT_SEARCH_WINDOW_HOURS;
  const sinceHours = Math.max(0, (now.getTime() - started) / 3_600_000);
  const hours = Math.ceil(sinceHours + SEARCH_WINDOW_OVERLAP_HOURS);
  return Math.min(
    MAX_SEARCH_WINDOW_HOURS,
    Math.max(MIN_SEARCH_WINDOW_HOURS, hours),
  );
}

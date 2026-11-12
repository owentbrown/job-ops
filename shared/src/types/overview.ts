import type { PipelineBucket } from "../pipeline-buckets";

export const OVERVIEW_RANGES = [7, 14, 30, 90] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export const SCORE_BANDS = ["<70", "70-79", "80-89", "90+"] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

/** Breakdown rows show a percentage only from this many applications. */
export const OVERVIEW_MIN_ROW_SAMPLE = 3;

export interface OverviewRateRow {
  applied: number;
  replied: number;
}

export interface OverviewSourceRow extends OverviewRateRow {
  source: string;
  /** Jobs found from this source in the range. */
  results: number;
}

export interface OverviewScoreBandRow extends OverviewRateRow {
  band: ScoreBand;
}

export interface OverviewSkippedJob {
  jobId: string;
  title: string;
  employer: string;
  score: number;
}

export interface OverviewResponse {
  rangeDays: OverviewRange;
  pipeline: {
    total: number;
    buckets: Record<PipelineBucket, number>;
    withdrawn: number;
  };
  actions: {
    readyCount: number;
    discoveredCount: number;
    inboxPendingCount: number;
    allJobsCount: number;
  };
  pace: {
    perDay: { date: string; count: number }[];
    avgPerDay: number;
    bestDay: { date: string; count: number } | null;
    medianFoundToAppliedDays: number | null;
  };
  replies: {
    applied: number;
    replied: number;
    responseRate: number | null;
    medianDaysToReply: number | null;
    emailsMatched: number;
  };
  sources: { rows: OverviewSourceRow[] };
  scoreBands: { rows: OverviewScoreBandRow[] };
  skips: { highScoreSkipped: OverviewSkippedJob[] };
}

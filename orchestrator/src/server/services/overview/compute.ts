/**
 * Pure calculations for the Overview page. Inputs are slim, already-scoped
 * rows (see load.ts); nothing here touches the database.
 */

import type { PipelineBucket } from "@shared/pipeline-buckets";
import { bucketFor, PIPELINE_BUCKETS } from "@shared/pipeline-buckets";
import { getEffectiveStageHistory } from "@shared/stage-history";
import {
  type ApplicationStage,
  type JobOutcome,
  type JobStatus,
  type OverviewRange,
  type OverviewResponse,
  type OverviewSourceRow,
  SCORE_BANDS,
  type ScoreBand,
  type StageEvent,
} from "@shared/types";

const DAY_MS = 86_400_000;
const HIGH_SCORE = 80;
const HIGH_SCORE_LIMIT = 10;

const REPLY_STAGES = new Set<ApplicationStage>([
  "screening",
  "interview",
  "offer",
]);
const REPLY_CLOSE_OUTCOMES = new Set<JobOutcome>([
  "rejected",
  "offer_accepted",
  "offer_declined",
]);
const MATCHED = new Set(["auto_linked", "manual_linked"]);
const REPLY_MESSAGE_TYPES = new Set(["interview", "offer", "rejection"]);

export type OverviewJobRow = {
  id: string;
  source: string;
  status: JobStatus;
  outcome: JobOutcome | null;
  suitabilityScore: number | null;
  title: string;
  employer: string;
  discoveredAt: string;
  appliedAt: string | null;
};

export type OverviewMessageRow = {
  matchedJobId: string | null;
  processingStatus: string;
  messageType: string;
  /** Epoch milliseconds. */
  receivedAt: number;
};

export type OverviewInput = {
  jobs: OverviewJobRow[];
  stageEvents: StageEvent[];
  messages: OverviewMessageRow[];
  jobStats: Record<JobStatus, number>;
  inboxPendingCount: number;
  now: Date;
  rangeDays: OverviewRange;
  timeZone: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Shift a `YYYY-MM-DD` key by whole calendar days. Pure calendar arithmetic
 * in UTC, so DST changes in the user's time zone can't skip or repeat a date.
 */
function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function band(score: number): ScoreBand {
  if (score >= 90) return "90+";
  if (score >= 80) return "80-89";
  if (score >= 70) return "70-79";
  return "<70";
}

function isReplyEvent(event: StageEvent): boolean {
  if (REPLY_STAGES.has(event.toStage)) return true;
  return (
    event.toStage === "closed" &&
    event.outcome !== null &&
    REPLY_CLOSE_OUTCOMES.has(event.outcome)
  );
}

type JobFacts = {
  job: OverviewJobRow;
  appliedMs: number;
  bucket: PipelineBucket | null;
  replyMs: number | null;
};

function factsFor(
  job: OverviewJobRow,
  events: StageEvent[],
  messages: OverviewMessageRow[],
): JobFacts {
  const history = getEffectiveStageHistory(events);
  const last = history.at(-1) ?? null;
  const stage: ApplicationStage = last?.toStage ?? "applied";
  const outcome =
    stage === "closed" ? (job.outcome ?? last?.outcome ?? null) : null;

  const replyTimes: number[] = [];
  const firstReplyEvent = history.find(isReplyEvent);
  if (firstReplyEvent) replyTimes.push(firstReplyEvent.occurredAt * 1000);
  for (const m of messages) {
    if (
      MATCHED.has(m.processingStatus) &&
      REPLY_MESSAGE_TYPES.has(m.messageType)
    ) {
      replyTimes.push(m.receivedAt);
    }
  }

  return {
    job,
    appliedMs: Date.parse(job.appliedAt as string),
    bucket: bucketFor(stage, outcome),
    replyMs: replyTimes.length ? Math.min(...replyTimes) : null,
  };
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string | null,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function computeOverview(input: OverviewInput): OverviewResponse {
  const nowMs = input.now.getTime();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone });
  const dayKey = (ms: number) => dayFmt.format(new Date(ms));
  const todayKey = dayKey(nowMs);
  // The range is exactly the calendar days drawn in the pace chart.
  const firstKey = shiftDayKey(todayKey, -(input.rangeDays - 1));
  const inRangeMs = (ms: number) => {
    if (Number.isNaN(ms)) return false;
    const key = dayKey(ms);
    return key >= firstKey && key <= todayKey;
  };

  const eventsByJob = groupBy(input.stageEvents, (e) => e.applicationId);
  const messagesByJob = groupBy(input.messages, (m) => m.matchedJobId);

  const applications = input.jobs
    .filter((job) => job.appliedAt)
    .map((job) =>
      factsFor(
        job,
        eventsByJob.get(job.id) ?? [],
        messagesByJob.get(job.id) ?? [],
      ),
    );
  const inRange = applications.filter((a) => inRangeMs(a.appliedMs));
  const replied = (list: JobFacts[]) =>
    list.filter((a) => a.replyMs !== null).length;

  // 01 Pipeline (all applications)
  const buckets = Object.fromEntries(
    PIPELINE_BUCKETS.map((b) => [b, 0]),
  ) as Record<PipelineBucket, number>;
  let withdrawn = 0;
  for (const a of applications) {
    if (a.bucket === null) withdrawn += 1;
    else buckets[a.bucket] += 1;
  }

  // Pace
  const counts = new Map<string, number>();
  for (const a of inRange) {
    const key = dayKey(a.appliedMs);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const perDay = Array.from({ length: input.rangeDays }, (_, i) => {
    const date = shiftDayKey(todayKey, -(input.rangeDays - 1 - i));
    return { date, count: counts.get(date) ?? 0 };
  });
  const best = perDay.reduce<{ date: string; count: number } | null>(
    (top, d) => (d.count > 0 && (!top || d.count > top.count) ? d : top),
    null,
  );
  const foundToApplied = median(
    inRange.map((a) =>
      Math.max(0, (a.appliedMs - Date.parse(a.job.discoveredAt)) / DAY_MS),
    ),
  );

  // Replies
  const repliedCount = replied(inRange);
  const daysToReply = median(
    inRange
      .filter((a) => a.replyMs !== null)
      .map((a) => Math.max(0, ((a.replyMs as number) - a.appliedMs) / DAY_MS)),
  );
  const emailsMatched = input.messages.filter(
    (m) => MATCHED.has(m.processingStatus) && inRangeMs(m.receivedAt),
  ).length;

  // Source yield
  const sourceRows = new Map<string, OverviewSourceRow>();
  const sourceRow = (source: string) => {
    let row = sourceRows.get(source);
    if (!row) {
      row = { source, results: 0, applied: 0, replied: 0 };
      sourceRows.set(source, row);
    }
    return row;
  };
  for (const job of input.jobs) {
    if (inRangeMs(Date.parse(job.discoveredAt)))
      sourceRow(job.source).results += 1;
  }
  for (const a of inRange) {
    const row = sourceRow(a.job.source);
    row.applied += 1;
    if (a.replyMs !== null) row.replied += 1;
  }

  // Score bands
  const bandRows = SCORE_BANDS.map((b) => ({
    band: b,
    applied: 0,
    replied: 0,
  }));
  for (const a of inRange) {
    if (a.job.suitabilityScore === null) continue;
    const row = bandRows.find(
      (r) => r.band === band(a.job.suitabilityScore as number),
    );
    if (!row) continue;
    row.applied += 1;
    if (a.replyMs !== null) row.replied += 1;
  }

  const stats = input.jobStats;
  return {
    rangeDays: input.rangeDays,
    pipeline: {
      total: applications.length - withdrawn,
      buckets,
      withdrawn,
    },
    actions: {
      readyCount: stats.ready,
      discoveredCount: stats.discovered,
      inboxPendingCount: input.inboxPendingCount,
      allJobsCount: Object.values(stats).reduce((sum, n) => sum + n, 0),
    },
    pace: {
      perDay,
      avgPerDay: inRange.length / input.rangeDays,
      bestDay: best,
      medianFoundToAppliedDays:
        foundToApplied === null ? null : round1(foundToApplied),
    },
    replies: {
      applied: inRange.length,
      replied: repliedCount,
      responseRate: repliedCount > 0 ? repliedCount / inRange.length : null,
      medianDaysToReply: daysToReply === null ? null : round1(daysToReply),
      emailsMatched,
    },
    sources: {
      rows: [...sourceRows.values()].sort(
        (a, b) =>
          b.applied - a.applied ||
          b.results - a.results ||
          a.source.localeCompare(b.source),
      ),
    },
    scoreBands: { rows: bandRows },
    skips: {
      highScoreSkipped: input.jobs
        .filter(
          (j) =>
            j.status === "skipped" &&
            j.suitabilityScore !== null &&
            j.suitabilityScore >= HIGH_SCORE,
        )
        .sort(
          (a, b) =>
            (b.suitabilityScore as number) - (a.suitabilityScore as number),
        )
        .slice(0, HIGH_SCORE_LIMIT)
        .map((j) => ({
          jobId: j.id,
          title: j.title,
          employer: j.employer,
          score: j.suitabilityScore as number,
        })),
    },
  };
}

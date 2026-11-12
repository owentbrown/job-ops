# Overview redesign, Part 2: the Overview page (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/overview` with the new page, in the current theme: 01 Pipeline, 02 Needs your action, 03 Insights. Keep the old page at `/overview/classic`.

**Architecture:**
- **Endpoint:** `GET /api/overview?range=…&tz=…` returns one `OverviewResponse`.
- **Server work is split in two:**
  - `services/overview/load.ts` reads slim rows from the database, scoped to the current user.
  - `services/overview/compute.ts` is pure functions that turn those rows into numbers. All the arithmetic lives there and is unit-tested without a database.
- **Client:** one query, plus small section components in `pages/overview/`.
- **Browser-check tile and status strip:** these reuse existing endpoints (`/pipeline/progress/snapshot`, `/pipeline/status`, `/pipeline/schedule`) instead of duplicating them.

**Tech stack:** TypeScript, Express, Drizzle/SQLite, React 18, TanStack Query, Tailwind v4, shadcn UI, recharts, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-11-overview-redesign-design.md`, Part 2. Part 1 (five stages, `shared/src/pipeline-buckets.ts`, `--bucket-*` tokens) is done on this branch.

**Departures from the spec (deliberate):**
- **No `engine` block in `OverviewResponse`.** The status strip reads the existing schedule and status endpoints.
- **Status strip shows less.** Per-run "searches / results / unique" counts are never saved, so the strip shows the schedule, the last run's time, jobs found and jobs scored, and the total job count.
- **Roles and skip reasons wait for Part 3.** The response has no `roles` block and no skip-reason rows yet, because `role_category` and `skip_category` arrive in Part 3. Their cards render a fixed hint now. The "Skipped but scored 80+" list works now.

**Environment:**
- Work in `/Users/owenbrown/Documents/Claude/job-ops-overview`.
- Run tests from `orchestrator/` with `npx vitest run <paths>`.
- Type check: `npm run check:types`. Lint: `npm run check:all`. Both from the repo root.
- Known unrelated failures: 2 date tests in `ApplicationsPerDayChart.test.tsx`.
- Never open the real database.

**Theme notes:**
- In **inline styles**, use the raw tokens `var(--bucket-awaiting)` etc. Tailwind v4's `@theme inline` only outputs a `--color-bucket-*` variable when a class uses it.
- In **classes**, `bg-bucket-offer`, `border-bucket-interview/60` and so on work.
- **Fonts:** `font-serif` is Lora and `font-mono` is IBM Plex Mono, both already loaded.

---

## Definitions (used by compute.ts and its tests)

| Term | Rule |
|---|---|
| Application | A job with `appliedAt` set. |
| In range | `appliedAt` (or `discoveredAt`, for source results) is within the last `range` days of `now`. |
| Effective history | `getEffectiveStageHistory(events)` from `@shared/stage-history`: events after the last move back to Applied, sorted. |
| Current stage | The last effective event's `toStage`, or `applied` if there are none. Outcome: for `closed`, `job.outcome ?? lastEvent.outcome`; otherwise `null`. |
| Bucket | `bucketFor(stage, outcome)`. `null` means withdrawn. |
| Reply event | An effective event with `toStage` screening, interview or offer, **or** `closed` with outcome rejected, offer_accepted or offer_declined. |
| Reply email | A message with `matchedJobId` set to the job, `processingStatus` auto_linked or manual_linked, and `messageType` interview, offer or rejection. |
| Replied / reply time | Replied if there's a reply event or a reply email. Reply time is the earliest of: first reply event `occurredAt × 1000` (stage times are seconds) and first reply email `receivedAt` (milliseconds). |
| Days | `(b − a) / 86_400_000`, rounded to 1 decimal. |
| Emails matched | Messages with `processingStatus` auto_linked or manual_linked and `receivedAt` in range. |
| Day key | Local date `YYYY-MM-DD` in the request `tz`, using `Intl.DateTimeFormat("en-CA", { timeZone })`. |

---

## File map

| File | Responsibility |
|---|---|
| `shared/src/types/overview.ts` (new) | Response types and constants |
| `shared/src/types/index.ts` | Export it |
| `orchestrator/src/server/services/overview/compute.ts` (new) | Pure calculations |
| `orchestrator/src/server/services/overview/compute.test.ts` (new) | Unit tests |
| `orchestrator/src/server/services/overview/load.ts` (new) | Scoped DB reads into `OverviewInput` |
| `orchestrator/src/server/api/routes/overview.ts` (new) + `.test.ts` | Route |
| `orchestrator/src/server/api/routes.ts` | Mount `/overview` |
| `orchestrator/src/client/api/overview.ts` (new), `client/api/client.ts` | Client call |
| `orchestrator/src/client/lib/queryKeys.ts` | `overview` keys |
| `orchestrator/src/client/pages/ClassicOverviewPage.tsx` (renamed from `HomePage.tsx`) | Old page |
| `orchestrator/src/client/pages/OverviewPage.tsx` (new) | New page |
| `orchestrator/src/client/pages/overview/SectionHeader.tsx` | "01 Pipeline" header |
| `orchestrator/src/client/pages/overview/PipelineCard.tsx` | Section 01 |
| `orchestrator/src/client/pages/overview/ActionTiles.tsx`, `EngineStatusStrip.tsx` | Section 02 |
| `orchestrator/src/client/pages/overview/PaceCard.tsx`, `RepliesCard.tsx`, `RolesCard.tsx`, `SkipsCard.tsx`, `SourceYieldTable.tsx`, `ScoreBandsCard.tsx` | Section 03 |
| `orchestrator/src/client/pages/overview/format.ts` | Shared formatting and threshold helpers |
| Tests next to each component | |
| `orchestrator/src/client/App.tsx`, `App.test.tsx` | Routes |

---

### Task 1: Response types

**Files:** create `shared/src/types/overview.ts`; modify `shared/src/types/index.ts`.

- [ ] **Step 1: Create `shared/src/types/overview.ts`**

```ts
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
```

- [ ] **Step 2: Export it.** Add `export * from "./overview";` to `shared/src/types/index.ts`, in alphabetical position after `./jobs`.

- [ ] **Step 3: Type check shared.** Run `npm run check:types:shared`. Expected: clean.

- [ ] **Step 4: Commit.** Message: `feat(shared): overview response types`.

---

### Task 2: Pure calculations

**Files:** create `orchestrator/src/server/services/overview/compute.ts` and `compute.test.ts`.

- [ ] **Step 1: Write the failing tests** (`compute.test.ts`)

```ts
import type { StageEvent } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  computeOverview,
  type OverviewInput,
  type OverviewJobRow,
  type OverviewMessageRow,
} from "./compute";

const NOW = new Date("2026-11-12T12:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const secs = (daysAgo: number) =>
  Math.floor((NOW.getTime() - daysAgo * DAY) / 1000);

let eventSeq = 0;
const event = (
  applicationId: string,
  toStage: StageEvent["toStage"],
  daysAgo: number,
  outcome: StageEvent["outcome"] = null,
): StageEvent => ({
  id: `e${++eventSeq}`,
  applicationId,
  title: "",
  groupId: null,
  fromStage: null,
  toStage,
  occurredAt: secs(daysAgo),
  metadata: null,
  outcome,
});

const job = (over: Partial<OverviewJobRow> & { id: string }): OverviewJobRow => ({
  source: "linkedin",
  status: "applied",
  outcome: null,
  suitabilityScore: null,
  title: "Growth Manager",
  employer: "Acme",
  discoveredAt: iso(20),
  appliedAt: iso(10),
  ...over,
});

const input = (over: Partial<OverviewInput> = {}): OverviewInput => ({
  jobs: [],
  stageEvents: [],
  messages: [],
  jobStats: {
    discovered: 4,
    processing: 0,
    ready: 2,
    applied: 0,
    in_progress: 0,
    skipped: 0,
    expired: 0,
  },
  inboxPendingCount: 1,
  now: NOW,
  rangeDays: 30,
  timeZone: "UTC",
  ...over,
});

describe("pipeline", () => {
  it("buckets every application regardless of range and counts withdrawn apart", () => {
    const result = computeOverview(
      input({
        jobs: [
          job({ id: "a", appliedAt: iso(200) }), // outside range, still counted
          job({ id: "s" }),
          job({ id: "r", outcome: "rejected" }),
          job({ id: "g", outcome: "ghosted" }),
          job({ id: "w", outcome: "withdrawn" }),
          job({ id: "n", appliedAt: null, status: "discovered" }),
        ],
        stageEvents: [
          event("s", "applied", 10),
          event("s", "screening", 5),
          event("r", "closed", 4, "rejected"),
          event("g", "closed", 3, "ghosted"),
          event("w", "closed", 2, "withdrawn"),
        ],
      }),
    );
    expect(result.pipeline).toEqual({
      total: 4,
      buckets: { awaiting: 2, screening: 1, interview: 0, offer: 0, rejected: 1 },
      withdrawn: 1,
    });
  });
});

describe("actions", () => {
  it("passes through counts and sums all jobs", () => {
    expect(computeOverview(input()).actions).toEqual({
      readyCount: 2,
      discoveredCount: 4,
      inboxPendingCount: 1,
      allJobsCount: 6,
    });
  });
});

describe("pace", () => {
  it("counts applications per local day over the range", () => {
    const result = computeOverview(
      input({
        rangeDays: 7,
        jobs: [
          job({ id: "1", appliedAt: iso(1), discoveredAt: iso(3) }),
          job({ id: "2", appliedAt: iso(1), discoveredAt: iso(2) }),
          job({ id: "3", appliedAt: iso(3), discoveredAt: iso(4) }),
          job({ id: "old", appliedAt: iso(30) }),
        ],
      }),
    );
    expect(result.pace.perDay).toHaveLength(7);
    expect(result.pace.perDay.at(-1)?.date).toBe("2026-11-12");
    expect(result.pace.perDay.find((d) => d.date === "2026-11-11")?.count).toBe(2);
    expect(result.pace.avgPerDay).toBeCloseTo(3 / 7, 5);
    expect(result.pace.bestDay).toEqual({ date: "2026-11-11", count: 2 });
    // found->applied: 2, 1, 1 days -> median 1
    expect(result.pace.medianFoundToAppliedDays).toBe(1);
  });

  it("has no best day or median when nothing was applied", () => {
    const result = computeOverview(input({ rangeDays: 7 }));
    expect(result.pace.bestDay).toBeNull();
    expect(result.pace.medianFoundToAppliedDays).toBeNull();
    expect(result.pace.avgPerDay).toBe(0);
  });
});

describe("replies", () => {
  it("counts a reply from a stage change, a rejection or a matched email", () => {
    const messages: OverviewMessageRow[] = [
      {
        matchedJobId: "mail",
        processingStatus: "auto_linked",
        messageType: "interview",
        receivedAt: NOW.getTime() - 6 * DAY,
      },
      {
        matchedJobId: "none",
        processingStatus: "auto_linked",
        messageType: "update", // not a reply
        receivedAt: NOW.getTime() - 6 * DAY,
      },
      {
        matchedJobId: null,
        processingStatus: "pending_user", // not matched
        messageType: "interview",
        receivedAt: NOW.getTime() - 2 * DAY,
      },
    ];
    const result = computeOverview(
      input({
        jobs: [
          job({ id: "stage", appliedAt: iso(10) }),
          job({ id: "rej", appliedAt: iso(10), outcome: "rejected" }),
          job({ id: "mail", appliedAt: iso(10) }),
          job({ id: "none", appliedAt: iso(10) }),
          job({ id: "ghost", appliedAt: iso(10), outcome: "ghosted" }),
        ],
        stageEvents: [
          event("stage", "screening", 8), // 2 days
          event("rej", "closed", 6, "rejected"), // 4 days
          event("ghost", "closed", 1, "ghosted"),
        ],
        messages,
      }),
    );
    expect(result.replies.applied).toBe(5);
    expect(result.replies.replied).toBe(3);
    expect(result.replies.responseRate).toBeCloseTo(0.6, 5);
    expect(result.replies.medianDaysToReply).toBe(4); // 2, 4, 4
    expect(result.replies.emailsMatched).toBe(2);
  });

  it("returns null rate and median before the first reply", () => {
    const result = computeOverview(input({ jobs: [job({ id: "x" })] }));
    expect(result.replies.responseRate).toBeNull();
    expect(result.replies.medianDaysToReply).toBeNull();
  });

  it("ignores stages logged before a move back to applied", () => {
    const back = event("b", "applied", 7);
    back.fromStage = "screening";
    const result = computeOverview(
      input({
        jobs: [job({ id: "b" })],
        stageEvents: [event("b", "screening", 8), back],
      }),
    );
    expect(result.replies.replied).toBe(0);
  });
});

describe("sources", () => {
  it("reports results, applied and replied per source", () => {
    const result = computeOverview(
      input({
        jobs: [
          job({ id: "1", source: "linkedin" }),
          job({ id: "2", source: "linkedin", appliedAt: null, status: "discovered" }),
          job({ id: "3", source: "indeed" }),
          job({ id: "4", source: "indeed", discoveredAt: iso(100), appliedAt: null }),
        ],
        stageEvents: [event("3", "interview", 2)],
      }),
    );
    // Tie on applied -> more results first.
    expect(result.sources.rows).toEqual([
      { source: "linkedin", results: 2, applied: 1, replied: 0 },
      { source: "indeed", results: 1, applied: 1, replied: 1 },
    ]);
  });
});

describe("score bands", () => {
  it("always returns four bands", () => {
    const result = computeOverview(
      input({
        jobs: [
          job({ id: "1", suitabilityScore: 65 }),
          job({ id: "2", suitabilityScore: 85 }),
          job({ id: "3", suitabilityScore: 92 }),
          job({ id: "4", suitabilityScore: null }),
        ],
        stageEvents: [event("3", "screening", 2)],
      }),
    );
    expect(result.scoreBands.rows).toEqual([
      { band: "<70", applied: 1, replied: 0 },
      { band: "70-79", applied: 0, replied: 0 },
      { band: "80-89", applied: 1, replied: 0 },
      { band: "90+", applied: 1, replied: 1 },
    ]);
  });
});

describe("skips", () => {
  it("lists skipped jobs scored 80+ highest first, at most 10", () => {
    const skipped = Array.from({ length: 12 }, (_, i) =>
      job({
        id: `s${i}`,
        status: "skipped",
        appliedAt: null,
        suitabilityScore: 80 + i,
        title: `Role ${i}`,
      }),
    );
    const result = computeOverview(
      input({
        jobs: [
          ...skipped,
          job({ id: "low", status: "skipped", appliedAt: null, suitabilityScore: 79 }),
        ],
      }),
    );
    expect(result.skips.highScoreSkipped).toHaveLength(10);
    expect(result.skips.highScoreSkipped[0]).toEqual({
      jobId: "s11",
      title: "Role 11",
      employer: "Acme",
      score: 91,
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `cd orchestrator && npx vitest run src/server/services/overview/compute.test.ts`. Expected: FAIL, because `./compute` can't be resolved.

- [ ] **Step 3: Implement `compute.ts`**

```ts
/**
 * Pure calculations for the Overview page. Inputs are slim, already-scoped
 * rows (see load.ts); nothing here touches the database.
 */
import { bucketFor, PIPELINE_BUCKETS } from "@shared/pipeline-buckets";
import type { PipelineBucket } from "@shared/pipeline-buckets";
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

const REPLY_STAGES = new Set<ApplicationStage>(["screening", "interview", "offer"]);
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
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
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
    if (MATCHED.has(m.processingStatus) && REPLY_MESSAGE_TYPES.has(m.messageType)) {
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

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
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
  const rangeStart = nowMs - input.rangeDays * DAY_MS;
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone });
  const dayKey = (ms: number) => dayFmt.format(new Date(ms));

  const eventsByJob = groupBy(input.stageEvents, (e) => e.applicationId);
  const messagesByJob = groupBy(input.messages, (m) => m.matchedJobId);

  const applications = input.jobs
    .filter((job) => job.appliedAt)
    .map((job) =>
      factsFor(job, eventsByJob.get(job.id) ?? [], messagesByJob.get(job.id) ?? []),
    );
  const inRange = applications.filter((a) => a.appliedMs >= rangeStart);
  const replied = (list: JobFacts[]) => list.filter((a) => a.replyMs !== null).length;

  // 01 Pipeline (all applications)
  const buckets = Object.fromEntries(PIPELINE_BUCKETS.map((b) => [b, 0])) as Record<
    PipelineBucket,
    number
  >;
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
    const date = dayKey(nowMs - (input.rangeDays - 1 - i) * DAY_MS);
    return { date, count: counts.get(date) ?? 0 };
  });
  const best = perDay.reduce<{ date: string; count: number } | null>(
    (top, d) => (d.count > 0 && (!top || d.count > top.count) ? d : top),
    null,
  );
  const foundToApplied = median(
    inRange.map((a) => (a.appliedMs - Date.parse(a.job.discoveredAt)) / DAY_MS),
  );

  // Replies
  const repliedCount = replied(inRange);
  const daysToReply = median(
    inRange
      .filter((a) => a.replyMs !== null)
      .map((a) => ((a.replyMs as number) - a.appliedMs) / DAY_MS),
  );
  const emailsMatched = input.messages.filter(
    (m) => MATCHED.has(m.processingStatus) && m.receivedAt >= rangeStart,
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
    if (Date.parse(job.discoveredAt) >= rangeStart) sourceRow(job.source).results += 1;
  }
  for (const a of inRange) {
    const row = sourceRow(a.job.source);
    row.applied += 1;
    if (a.replyMs !== null) row.replied += 1;
  }

  // Score bands
  const bandRows = SCORE_BANDS.map((b) => ({ band: b, applied: 0, replied: 0 }));
  for (const a of inRange) {
    if (a.job.suitabilityScore === null) continue;
    const row = bandRows.find((r) => r.band === band(a.job.suitabilityScore as number));
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
      medianFoundToAppliedDays: foundToApplied === null ? null : round1(foundToApplied),
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
        (a, b) => b.applied - a.applied || b.results - a.results || a.source.localeCompare(b.source),
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
        .sort((a, b) => (b.suitabilityScore as number) - (a.suitabilityScore as number))
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
```

Check that `@shared/stage-history` resolves through the `@shared/*` alias (`shared/src/stage-history.ts`). If `getEffectiveStageHistory` expects another argument shape, read `shared/src/stage-history.ts` and adapt the call, not the definition.

- [ ] **Step 4: Run the tests.** Run `npx vitest run src/server/services/overview/compute.test.ts`. Expected: PASS. If an expected number looks wrong, recheck it against the Definitions table before changing the test, and report any mismatch.

- [ ] **Step 5: Commit.** Message: `feat(overview): pure overview calculations`.

---

### Task 3: Loader and route

**Files:**
- Create `orchestrator/src/server/services/overview/load.ts`
- Create `orchestrator/src/server/api/routes/overview.ts` and `overview.test.ts`
- Modify `orchestrator/src/server/api/routes.ts`

- [ ] **Step 1: Write the failing route test** (`overview.test.ts`). Follow `spend.test.ts`: `startServer`/`stopServer` from `./test-utils`, and seed through the repositories.

```ts
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Overview API route", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });
  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns pipeline buckets and counts for seeded jobs", async () => {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { transitionStage } = await import("@server/services/applicationTracking");

    const a = await createJob({
      source: "linkedin",
      title: "Growth Manager",
      employer: "Acme",
      jobUrl: "https://example.com/a",
      jobDescription: "d",
    });
    await updateJob(a.id, { status: "applied", appliedAt: new Date().toISOString() });
    transitionStage(a.id, "screening");
    await createJob({
      source: "indeed",
      title: "Analyst",
      employer: "Beta",
      jobUrl: "https://example.com/b",
      jobDescription: "d",
    });

    const res = await fetch(`${baseUrl}/api/overview?range=30&tz=UTC`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data ?? body;
    expect(data.rangeDays).toBe(30);
    expect(data.pipeline.total).toBe(1);
    expect(data.pipeline.buckets.screening).toBe(1);
    expect(data.actions.allJobsCount).toBe(2);
    expect(data.replies.replied).toBe(1);
  });

  it("rejects an unsupported range", async () => {
    const res = await fetch(`${baseUrl}/api/overview?range=5`);
    expect(res.status).toBe(400);
  });
});
```

Check the real signatures of `transitionStage` (in `applicationTracking.ts`) and `updateJob` (whether `appliedAt` is accepted), and adjust only the seeding calls to match. Also check how `ok()` wraps responses (`@infra/http`): keep `body.data ?? body` or use the exact shape.

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run src/server/api/routes/overview.test.ts`. Expected: FAIL with a 404.

- [ ] **Step 3: Create `load.ts`**

```ts
/** Reads the slim, user-scoped rows that computeOverview needs. */
import { db, schema } from "@server/db";
import { getJobStats } from "@server/repositories/jobs";
import { privateDataScopeFilter } from "@server/tenancy/private-scope";
import type {
  ApplicationStage,
  JobOutcome,
  JobStatus,
  OverviewRange,
  StageEvent,
} from "@shared/types";
import { and, count, eq } from "drizzle-orm";
import type { OverviewInput } from "./compute";

const { jobs, stageEvents, postApplicationMessages } = schema;

export async function loadOverviewInput(args: {
  rangeDays: OverviewRange;
  timeZone: string;
  now?: Date;
}): Promise<OverviewInput> {
  const [jobRows, eventRows, messageRows, pendingRows, jobStats] =
    await Promise.all([
      db
        .select({
          id: jobs.id,
          source: jobs.source,
          status: jobs.status,
          outcome: jobs.outcome,
          suitabilityScore: jobs.suitabilityScore,
          title: jobs.title,
          employer: jobs.employer,
          discoveredAt: jobs.discoveredAt,
          appliedAt: jobs.appliedAt,
        })
        .from(jobs)
        .where(privateDataScopeFilter(jobs)),
      db.select().from(stageEvents).where(privateDataScopeFilter(stageEvents)),
      db
        .select({
          matchedJobId: postApplicationMessages.matchedJobId,
          processingStatus: postApplicationMessages.processingStatus,
          messageType: postApplicationMessages.messageType,
          receivedAt: postApplicationMessages.receivedAt,
        })
        .from(postApplicationMessages)
        .where(privateDataScopeFilter(postApplicationMessages)),
      db
        .select({ n: count() })
        .from(postApplicationMessages)
        .where(
          and(
            privateDataScopeFilter(postApplicationMessages),
            eq(postApplicationMessages.processingStatus, "pending_user"),
          ),
        ),
      getJobStats(),
    ]);

  const events: StageEvent[] = eventRows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    title: row.title,
    groupId: row.groupId ?? null,
    fromStage: (row.fromStage as ApplicationStage | null) ?? null,
    toStage: row.toStage as ApplicationStage,
    occurredAt: row.occurredAt,
    metadata: null,
    outcome: (row.outcome as JobOutcome | null) ?? null,
  }));

  return {
    jobs: jobRows.map((r) => ({
      ...r,
      status: r.status as JobStatus,
      outcome: (r.outcome as JobOutcome | null) ?? null,
      title: r.title ?? "",
      employer: r.employer ?? "",
    })),
    stageEvents: events,
    messages: messageRows.map((m) => ({
      matchedJobId: m.matchedJobId ?? null,
      processingStatus: m.processingStatus,
      messageType: m.messageType,
      receivedAt: m.receivedAt,
    })),
    jobStats,
    inboxPendingCount: pendingRows[0]?.n ?? 0,
    now: args.now ?? new Date(),
    rangeDays: args.rangeDays,
    timeZone: args.timeZone,
  };
}
```

Check the schema field names: `matchedJobId`, `processingStatus` and `messageType` on `postApplicationMessages`, and `title` and `employer` nullability on `jobs`. Fix the casts to match. `metadata: null` is deliberate: compute.ts never reads it.

- [ ] **Step 4: Create the route** (`overview.ts`)

```ts
/** Overview dashboard data (fork: overview v2). */
import { badRequest, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { computeOverview } from "@server/services/overview/compute";
import { loadOverviewInput } from "@server/services/overview/load";
import { OVERVIEW_RANGES, type OverviewRange } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const overviewRouter = Router();

const querySchema = z.object({
  range: z.coerce
    .number()
    .refine(
      (v): v is OverviewRange => (OVERVIEW_RANGES as readonly number[]).includes(v),
      "range must be 7, 14, 30 or 90",
    )
    .default(30),
  tz: z
    .string()
    .max(100)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone")
    .default("UTC"),
});

overviewRouter.get("/", async (req: Request, res: Response) => {
  try {
    const q = querySchema.parse(req.query);
    const input = await loadOverviewInput({
      rangeDays: q.range as OverviewRange,
      timeZone: q.tz,
    });
    ok(res, computeOverview(input));
  } catch (error) {
    const err =
      error instanceof z.ZodError
        ? badRequest(error.issues.map((i) => i.message).join("; "))
        : toAppError(error);
    logger[err.status >= 500 ? "error" : "warn"]("Overview route failed", {
      status: err.status,
      code: err.code,
    });
    fail(res, err);
  }
});
```

- [ ] **Step 5: Mount it.** In `orchestrator/src/server/api/routes.ts`, add `import { overviewRouter } from "./routes/overview";` with the other imports, and `apiRouter.use("/overview", overviewRouter);` after the `/spend` line.

- [ ] **Step 6: Run the route test.** Run `npx vitest run src/server/api/routes/overview.test.ts src/server/services/overview`. Expected: PASS. Also run `src/server/api/routes/api-contract.test.ts`. If it lists every route, add `/overview` the way the others are listed.

- [ ] **Step 7: Commit.** Message: `feat(overview): GET /api/overview`.

---

### Task 4: Client API, query key, classic page and route

**Files:**
- Create `orchestrator/src/client/api/overview.ts`
- Modify `client/api/client.ts`, `client/lib/queryKeys.ts`, `client/App.tsx`, `client/App.test.tsx`
- Rename `client/pages/HomePage.tsx` to `client/pages/ClassicOverviewPage.tsx`

- [ ] **Step 1: Create `client/api/overview.ts`**

```ts
import type { OverviewRange, OverviewResponse } from "@shared/types.js";
import { fetchApi } from "./core";

export async function getOverview(args: {
  range: OverviewRange;
  timeZone: string;
}): Promise<OverviewResponse> {
  const params = new URLSearchParams({
    range: String(args.range),
    tz: args.timeZone,
  });
  return fetchApi<OverviewResponse>(`/overview?${params.toString()}`);
}
```

Add `export * from "./overview";` to `client/api/client.ts`, in alphabetical order.

- [ ] **Step 2: Add query keys** to `client/lib/queryKeys.ts`, after `pipeline`:

```ts
  overview: {
    all: ["overview"] as const,
    data: (range: number) => [...queryKeys.overview.all, range] as const,
  },
```

Also add `pipeline.progressSnapshot: () => [...queryKeys.pipeline.all, "progress-snapshot"] as const` inside `pipeline` if no equivalent key exists (grep first).

- [ ] **Step 3: Move the old page.**
  - Run `git mv orchestrator/src/client/pages/HomePage.tsx orchestrator/src/client/pages/ClassicOverviewPage.tsx`.
  - Inside it, rename the component to `ClassicOverviewPage` and set the `PageHeader` `title="Overview (classic)"`.
  - Imports such as `./overview/OverviewPipelineRunsSection` stay valid.

- [ ] **Step 4: Routes.**
  - In `App.tsx`, import `ClassicOverviewPage` and add `<Route path="/overview/classic" element={<ClassicOverviewPage />} />` next to `/overview`.
  - Leave `/overview` pointing at a temporary `ClassicOverviewPage` until Task 9 swaps in `OverviewPage`.
  - In `App.test.tsx`, change the `./pages/HomePage` mock to `./pages/ClassicOverviewPage` and export `ClassicOverviewPage`.
  - Grep the repo for other `HomePage` imports and update them.

- [ ] **Step 5: Check it.** Run `npm run check:types`, then `cd orchestrator && npx vitest run src/client/App.test.tsx`. Expected: clean, PASS.

- [ ] **Step 6: Commit.** Message: `refactor(overview): keep the old page at /overview/classic; add overview client API`.

---

### Task 5: Shared helpers, section header and pipeline card

**Files:** create `pages/overview/format.ts`, `SectionHeader.tsx`, `PipelineCard.tsx` and `PipelineCard.test.tsx` (all under `orchestrator/src/client/`).

- [ ] **Step 1: Create `format.ts`**

```ts
import { OVERVIEW_MIN_ROW_SAMPLE } from "@shared/types.js";

export const percent = (n: number, d: number) =>
  d === 0 ? 0 : Math.round((n / d) * 100);

/** "7 of 18 · 39%", or "7 of 18" when the sample is too small to read. */
export function rateLabel(replied: number, applied: number): string {
  const base = `${replied} of ${applied}`;
  return applied >= OVERVIEW_MIN_ROW_SAMPLE
    ? `${base} · ${percent(replied, applied)}%`
    : base;
}

export const canShowRate = (applied: number) => applied >= OVERVIEW_MIN_ROW_SAMPLE;

export const formatDays = (days: number | null) =>
  days === null ? "—" : `${days} ${days === 1 ? "day" : "days"}`;

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
```

- [ ] **Step 2: Create `SectionHeader.tsx`**

```tsx
import type React from "react";

export const SectionHeader: React.FC<{
  index: string;
  title: string;
  id: string;
  children?: React.ReactNode;
}> = ({ index, title, id, children }) => (
  <div className="mb-4 flex items-baseline justify-between gap-4">
    <h2 id={id} className="flex items-baseline gap-3">
      <span className="font-mono text-xs text-muted-foreground">{index}</span>
      <span className="font-serif text-2xl tracking-tight">{title}</span>
    </h2>
    {children}
  </div>
);
```

- [ ] **Step 3: Write the failing test** (`PipelineCard.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PipelineCard } from "./PipelineCard";

const pipeline = {
  total: 10,
  buckets: { awaiting: 6, screening: 2, interview: 0, offer: 1, rejected: 1 },
  withdrawn: 2,
};

describe("PipelineCard", () => {
  it("shows the total, a labelled bar and a legend with counts", () => {
    render(<PipelineCard pipeline={pipeline} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    const bar = screen.getByRole("img", { name: /pipeline/i });
    expect(bar).toHaveAccessibleName(
      "Pipeline: Awaiting reply 6, Screening 2, Interview 0, Offer 1, Rejected 1",
    );
    expect(screen.getByText("Awaiting reply")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("hides zero segments and notes withdrawn applications", () => {
    const { container } = render(<PipelineCard pipeline={pipeline} />);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(4);
    expect(screen.getByText("+2 withdrawn")).toBeInTheDocument();
  });

  it("shows an empty hint with no applications", () => {
    render(
      <PipelineCard
        pipeline={{
          total: 0,
          buckets: { awaiting: 0, screening: 0, interview: 0, offer: 0, rejected: 0 },
          withdrawn: 0,
        }}
      />,
    );
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails.** Run `npx vitest run src/client/pages/overview/PipelineCard.test.tsx`. Expected: FAIL.

- [ ] **Step 5: Implement `PipelineCard.tsx`**

```tsx
import {
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
} from "@shared/pipeline-buckets";
import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { percent } from "./format";

export const PipelineCard: React.FC<{
  pipeline: OverviewResponse["pipeline"];
}> = ({ pipeline }) => {
  const { total, buckets, withdrawn } = pipeline;
  const ariaLabel = `Pipeline: ${PIPELINE_BUCKETS.map(
    (b) => `${PIPELINE_BUCKET_LABELS[b]} ${buckets[b]}`,
  ).join(", ")}`;

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="space-y-5 p-6">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-4xl tabular-nums">{total}</span>
          <span className="text-sm text-muted-foreground">
            {total === 1 ? "application" : "applications"}
          </span>
        </p>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No applications yet. Mark a job as applied and it shows up here.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label={ariaLabel}
              className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            >
              {PIPELINE_BUCKETS.filter((b) => buckets[b] > 0).map((b) => (
                <div
                  key={b}
                  data-segment={b}
                  className="h-full min-w-[10px]"
                  style={{
                    flexGrow: buckets[b],
                    backgroundColor: `var(--bucket-${b})`,
                  }}
                />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {PIPELINE_BUCKETS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--bucket-${b})` }}
                  />
                  <span>{PIPELINE_BUCKET_LABELS[b]}</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {buckets[b]}
                  </span>
                  <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {percent(buckets[b], total)}%
                  </span>
                </li>
              ))}
            </ul>
            {withdrawn > 0 ? (
              <p className="text-xs text-muted-foreground">+{withdrawn} withdrawn</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 6: Run the test.** Expected: PASS.

- [ ] **Step 7: Commit.** Message: `feat(overview): pipeline card and section header`.

---

### Task 6: Action tiles and engine status strip

**Files:** create `pages/overview/ActionTiles.tsx`, `ActionTiles.test.tsx`, `EngineStatusStrip.tsx` and `EngineStatusStrip.test.tsx`.

- [ ] **Step 1: Write the failing tests**

`ActionTiles.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ActionTiles } from "./ActionTiles";

const actions = {
  readyCount: 3,
  discoveredCount: 0,
  inboxPendingCount: 2,
  allJobsCount: 40,
};

const renderTiles = (challenge: { extractorName: string } | null = null) =>
  render(
    <MemoryRouter>
      <ActionTiles actions={actions} challenge={challenge} />
    </MemoryRouter>,
  );

describe("ActionTiles", () => {
  it("links each tile to its page", () => {
    renderTiles();
    expect(screen.getByRole("link", { name: /3 jobs to review/i })).toHaveAttribute(
      "href",
      "/jobs/ready",
    );
    expect(
      screen.getByRole("link", { name: /0 new jobs discovered/i }),
    ).toHaveAttribute("href", "/jobs/discovered");
    expect(
      screen.getByRole("link", { name: /2 emails to match or confirm/i }),
    ).toHaveAttribute("href", "/applications/inbox");
  });

  it("shows the browser-check tile only when a search is blocked", () => {
    renderTiles();
    expect(screen.queryByText(/blocking your search/i)).not.toBeInTheDocument();
    renderTiles({ extractorName: "Hiring Cafe" });
    expect(screen.getByText(/blocking your search/i)).toBeInTheDocument();
    expect(screen.getByText(/hiring cafe/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /solve/i })).toHaveAttribute(
      "href",
      "/jobs/ready",
    );
  });
});
```

`EngineStatusStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineStatusStrip } from "./EngineStatusStrip";

describe("EngineStatusStrip", () => {
  it("summarises the schedule, last run and job count", () => {
    render(
      <EngineStatusStrip
        schedule={{ enabled: true, hour: 8, days: [0, 1, 2, 3, 4, 5, 6] }}
        lastRun={{
          startedAt: "2026-11-12T13:00:00Z",
          status: "completed",
          jobsDiscovered: 46,
          jobsProcessed: 12,
        }}
        allJobsCount={742}
      />,
    );
    expect(screen.getByText(/daily 8:00/i)).toBeInTheDocument();
    expect(screen.getByText(/46 found/i)).toBeInTheDocument();
    expect(screen.getByText(/12 scored/i)).toBeInTheDocument();
    expect(screen.getByText(/742 all jobs/i)).toBeInTheDocument();
  });

  it("says when no search is scheduled", () => {
    render(<EngineStatusStrip schedule={null} lastRun={null} allJobsCount={0} />);
    expect(screen.getByText(/not scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** Expected: FAIL.

- [ ] **Step 3: Implement `ActionTiles.tsx`**

```tsx
import type { OverviewResponse } from "@shared/types.js";
import { AlertTriangle } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tile = { label: string; count: number; noun: string; to: string; cta: string };

const TileShell: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div
    className={cn(
      "flex min-h-[210px] min-w-[260px] flex-1 basis-[280px] flex-col justify-between rounded-[18px] border border-border/60 bg-card p-6",
      className,
    )}
  >
    {children}
  </div>
);

export const ActionTiles: React.FC<{
  actions: OverviewResponse["actions"];
  challenge: { extractorName: string } | null;
}> = ({ actions, challenge }) => {
  const tiles: Tile[] = [
    { label: "Review", count: actions.readyCount, noun: "jobs to review", to: "/jobs/ready", cta: "Open Ready" },
    { label: "Discover", count: actions.discoveredCount, noun: "new jobs discovered", to: "/jobs/discovered", cta: "Open Discovered" },
    { label: "Inbox", count: actions.inboxPendingCount, noun: "emails to match or confirm", to: "/applications/inbox", cta: "Open Inbox" },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {challenge ? (
        <TileShell className="border-warning/50 bg-warning/10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Blocking your search
          </p>
          <p className="font-serif text-3xl leading-tight">
            Solve browser check
            <span className="mt-1 block text-base text-muted-foreground">
              {challenge.extractorName}
            </span>
          </p>
          <Link
            to="/jobs/ready"
            className="self-start rounded-[10px] bg-warning px-4 py-2 text-sm font-medium text-warning-foreground"
          >
            Solve
          </Link>
        </TileShell>
      ) : null}

      {tiles.map((t) => (
        <TileShell key={t.to} className={t.count === 0 ? "opacity-80" : undefined}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.label}
          </p>
          <p
            className={cn(
              "font-mono text-6xl leading-none tabular-nums",
              t.count === 0 && "text-muted-foreground",
            )}
          >
            {t.count}
          </p>
          <Link
            to={t.to}
            aria-label={`${t.count} ${t.noun}`}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.noun} →
          </Link>
        </TileShell>
      ))}
    </div>
  );
};
```

Note: the visible link text is the noun, and the aria-label carries the count, so screen readers hear "3 jobs to review". `cta` isn't used. Drop it from the `Tile` type to keep Biome happy.

- [ ] **Step 4: Implement `EngineStatusStrip.tsx`**

```tsx
import type { PipelineRun, SearchScheduleStatus } from "@shared/types.js";
import type React from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleText(
  s: Pick<SearchScheduleStatus, "enabled" | "hour" | "days"> | null,
): string {
  if (!s?.enabled) return "Not scheduled";
  const time = new Date(2000, 0, 1, s.hour).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const days =
    s.days.length === 7 ? "Daily" : s.days.map((d) => DAY_NAMES[d]).join(", ");
  return `${days} ${time}`;
}

export const EngineStatusStrip: React.FC<{
  schedule: Pick<SearchScheduleStatus, "enabled" | "hour" | "days"> | null;
  lastRun: Pick<
    PipelineRun,
    "startedAt" | "status" | "jobsDiscovered" | "jobsProcessed"
  > | null;
  allJobsCount: number;
}> = ({ schedule, lastRun, allJobsCount }) => {
  const parts = [
    "Search engine",
    scheduleText(schedule),
    lastRun
      ? `Last run ${new Date(lastRun.startedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}${lastRun.status === "failed" ? " (failed)" : ""}`
      : "No runs yet",
    ...(lastRun
      ? [`${lastRun.jobsDiscovered} found`, `${lastRun.jobsProcessed} scored`]
      : []),
    `${allJobsCount} all jobs`,
  ];
  return (
    <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 rounded-lg border border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? <span aria-hidden className="mr-2">·</span> : null}
          {p}
        </span>
      ))}
    </p>
  );
};
```

Check the test's expectation `/daily 8:00/i` against `toLocaleTimeString` in the test environment. If the locale renders "08:00", loosen the regex to `/daily .*8:00/i`. Don't change the component.

- [ ] **Step 5: Run both tests.** Expected: PASS.

- [ ] **Step 6: Commit.** Message: `feat(overview): action tiles and search engine strip`.

---

### Task 7: Insights cards

**Files:** create the following in `pages/overview/`:
- `PaceCard.tsx`, `RepliesCard.tsx`, `RolesCard.tsx`, `SkipsCard.tsx`, `SourceYieldTable.tsx`, `ScoreBandsCard.tsx`
- one test file, `InsightsCards.test.tsx`

All cards share one shell: `Card` with `border-border/60 shadow-none`, an `h3` title (`text-sm font-semibold`), and mono numbers.

- [ ] **Step 1: Write the failing tests** (`InsightsCards.test.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { PaceCard } from "./PaceCard";
import { RepliesCard } from "./RepliesCard";
import { RolesCard } from "./RolesCard";
import { ScoreBandsCard } from "./ScoreBandsCard";
import { SkipsCard } from "./SkipsCard";
import { SourceYieldTable } from "./SourceYieldTable";

vi.mock("@/client/api", async (orig) => ({
  ...(await orig<typeof import("@/client/api")>()),
  updateJob: vi.fn().mockResolvedValue({}),
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("RepliesCard", () => {
  it("shows dashes and a hint before the first reply", () => {
    wrap(
      <RepliesCard
        replies={{ applied: 12, replied: 0, responseRate: null, medianDaysToReply: null, emailsMatched: 0 }}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/too early to read/i)).toBeInTheDocument();
  });

  it("shows rate, median and emails once replies exist", () => {
    wrap(
      <RepliesCard
        replies={{ applied: 20, replied: 5, responseRate: 0.25, medianDaysToReply: 4.5, emailsMatched: 7 }}
      />,
    );
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/5 of 20 applications/i)).toBeInTheDocument();
    expect(screen.getByText("4.5 days")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("PaceCard", () => {
  it("shows average, best day and found to applied", () => {
    wrap(
      <PaceCard
        pace={{
          perDay: [
            { date: "2026-11-11", count: 2 },
            { date: "2026-11-12", count: 0 },
          ],
          avgPerDay: 1,
          bestDay: { date: "2026-11-11", count: 2 },
          medianFoundToAppliedDays: 1.5,
        }}
      />,
    );
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText(/2 on /i)).toBeInTheDocument();
    expect(screen.getByText("1.5 days")).toBeInTheDocument();
  });
});

describe("SourceYieldTable", () => {
  it("shows a reply rate only from three applications", () => {
    wrap(
      <SourceYieldTable
        rows={[
          { source: "linkedin", results: 40, applied: 5, replied: 2 },
          { source: "indeed", results: 10, applied: 2, replied: 1 },
        ]}
      />,
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});

describe("ScoreBandsCard", () => {
  it("hints instead of drawing bars with too little data", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 1, replied: 0 },
          { band: "70-79", applied: 0, replied: 0 },
          { band: "80-89", applied: 2, replied: 0 },
          { band: "90+", applied: 0, replied: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/fills in after your first reply/i)).toBeInTheDocument();
  });
});

describe("RolesCard", () => {
  it("explains that role categories arrive later", () => {
    wrap(<RolesCard />);
    expect(screen.getByText(/once applications are categorized/i)).toBeInTheDocument();
  });
});

describe("SkipsCard", () => {
  beforeEach(() => vi.mocked(api.updateJob).mockClear());

  it("lists high-score skips and reconsiders one", async () => {
    wrap(
      <SkipsCard
        range={30}
        highScoreSkipped={[{ jobId: "j1", title: "Growth Lead", employer: "Acme", score: 88 }]}
      />,
    );
    expect(screen.getByText("Growth Lead")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reconsider growth lead/i }));
    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith("j1", { status: "discovered" }),
    );
  });

  it("says so when there is nothing to reconsider", () => {
    wrap(<SkipsCard range={30} highScoreSkipped={[]} />);
    expect(screen.getByText(/no skipped jobs scored 80/i)).toBeInTheDocument();
  });
});
```

Check `api.updateJob`'s signature in `client/api/jobs.ts`, and how other tests mock `@/client/api` (grep `vi.mock("@/client/api"` or `"../api"`). Match the module path the components import from.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement the cards.**

`RepliesCard.tsx`:

```tsx
import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDays } from "./format";

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="flex-1 rounded-xl border border-border/60 p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-2 font-mono text-3xl tabular-nums">{value}</p>
    {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
  </div>
);

export const RepliesCard: React.FC<{ replies: OverviewResponse["replies"] }> = ({ replies }) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-4 p-6">
      <h3 className="text-sm font-semibold">Replies</h3>
      <div className="flex flex-wrap gap-3">
        <Stat
          label="Response rate"
          value={replies.responseRate === null ? "—" : `${Math.round(replies.responseRate * 100)}%`}
          note={`${replies.replied} of ${replies.applied} applications`}
        />
        <Stat label="Median time to reply" value={formatDays(replies.medianDaysToReply)} />
        <Stat label="Emails matched" value={String(replies.emailsMatched)} />
      </div>
      {replies.replied === 0 ? (
        <p className="text-xs text-muted-foreground">
          Too early to read. These fill in after your first reply.
        </p>
      ) : null}
    </CardContent>
  </Card>
);
```

`PaceCard.tsx` follows the recharts and `ChartContainer` usage in `components/charts/ApplicationsPerDayChart.tsx`. Read it and copy its imports and `ChartContainer` config pattern.

```tsx
import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Bar, BarChart, XAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatDays, formatShortDate } from "./format";

const config = { count: { label: "Applications", color: "var(--primary)" } } satisfies ChartConfig;

export const PaceCard: React.FC<{ pace: OverviewResponse["pace"] }> = ({ pace }) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-4 p-6">
      <h3 className="text-sm font-semibold">Pace</h3>
      <ChartContainer config={config} className="h-40 w-full">
        <BarChart data={pace.perDay}>
          <XAxis dataKey="date" tickFormatter={formatShortDate} tickLine={false} axisLine={false} minTickGap={24} />
          <Bar dataKey="count" fill="var(--color-count)" radius={3} />
        </BarChart>
      </ChartContainer>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Average per day</dt>
          <dd className="font-mono text-xl tabular-nums">{pace.avgPerDay.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Best day</dt>
          <dd className="font-mono text-xl tabular-nums">
            {pace.bestDay ? `${pace.bestDay.count} on ${formatShortDate(pace.bestDay.date)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Found → applied</dt>
          <dd className="font-mono text-xl tabular-nums">{formatDays(pace.medianFoundToAppliedDays)}</dd>
        </div>
      </dl>
    </CardContent>
  </Card>
);
```

If the `ChartConfig` export name differs, use what `ApplicationsPerDayChart` uses.

`SourceYieldTable.tsx`:

```tsx
import type { OverviewSourceRow } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { canShowRate, percent } from "./format";

export const SourceYieldTable: React.FC<{ rows: OverviewSourceRow[] }> = ({ rows }) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-4 p-6">
      <h3 className="text-sm font-semibold">Source yield</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs found in this range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 font-normal">Board</th>
              <th className="pb-2 text-right font-normal">Results</th>
              <th className="pb-2 text-right font-normal">Applied</th>
              <th className="pb-2 text-right font-normal">Replied</th>
              <th className="pb-2 text-right font-normal">Reply rate</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r) => (
              <tr key={r.source} className="border-t border-border/50">
                <td className="py-2 font-sans">{r.source}</td>
                <td className="py-2 text-right">{r.results}</td>
                <td className="py-2 text-right">{r.applied}</td>
                <td className="py-2 text-right">{r.replied}</td>
                <td className="py-2 text-right">
                  {canShowRate(r.applied) ? `${percent(r.replied, r.applied)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CardContent>
  </Card>
);
```

Use the source's display name if a helper exists. Grep for a source label map, for example in `shared/src/extractors`, and use it in the Board column. Otherwise show the id.

`ScoreBandsCard.tsx`:
- Rows show `rateLabel(replied, applied)` and a horizontal bar of width `percent(replied, applied)%`, only when `canShowRate(applied)`.
- **Hint:** if no band reaches the sample size, **or** the total replied is 0, render only the hint "Fills in after your first reply and a few applications in each band."
- **Takeaway:** otherwise, add a one-line takeaway, worked out from the two bands with the highest rate that are readable (`canShowRate`):
  - If the top band is `90+` or `80-89` and its rate is at least 10 points above the lowest readable band: "Higher scores are getting more replies."
  - Else, if the lowest score band has the highest rate: "Scores aren't predicting replies yet."
  - Else: "No clear pattern yet."
- Bar fill: `bg-primary`.

`RolesCard.tsx`:

```tsx
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";

export const RolesCard: React.FC = () => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-2 p-6">
      <h3 className="text-sm font-semibold">Response rate by role</h3>
      <p className="text-2xl font-mono text-muted-foreground">—</p>
      <p className="text-sm text-muted-foreground">
        Appears once applications are categorized by role.
      </p>
    </CardContent>
  </Card>
);
```

`SkipsCard.tsx`:
- Title: "Why you skip".
- Under the title, the fixed line "Skip reasons appear once you start picking them when you skip a job." (Part 3 replaces it with bars.)
- Below that, a subheading "Skipped but scored 80+" with a list. Each row shows the title (linked to `/job/${jobId}`), the employer, the score in mono, and a `Button` (`variant="outline" size="sm"`) labelled "Reconsider" with `aria-label={`Reconsider ${title}`}`.
- **Reconsider click:** `useMutation` calling `api.updateJob(jobId, { status: "discovered" })`. On success, `queryClient.invalidateQueries({ queryKey: queryKeys.overview.all })` and `toast.success("Moved back to Discovered")` (from `sonner`). On error, `showErrorToast(error, "Couldn't move the job")` (from `@/client/lib/error-toast`).
- **Empty list:** "No skipped jobs scored 80+."

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(overview): insight cards`.

---

### Task 8: The Overview page

**Files:** create `pages/OverviewPage.tsx` and `pages/OverviewPage.test.tsx`; modify `App.tsx`.

- [ ] **Step 1: Write the failing test** (`OverviewPage.test.tsx`). Mock `@/client/api`:
  - `getOverview` resolves a full `OverviewResponse` fixture: `pipeline.total` 3, `readyCount` 2, `replies.replied` 0, and the other values small and consistent.
  - `getPipelineProgressSnapshot` resolves `{ step: "idle", pendingChallenges: [] }` cast as needed.
  - `getPipelineStatus` resolves `{ isRunning: false, lastRun: null, nextScheduledRun: null }`.
  - `getSearchSchedule` resolves `{ enabled: false, hour: 8, days: [] }` cast.

Render inside `QueryClientProvider` and `MemoryRouter initialEntries={["/overview?duration=7"]}`. Assert:
- the headings "Pipeline", "Needs your action" and "Insights" are present;
- `getOverview` was called with `expect.objectContaining({ range: 7 })`;
- clicking the "30d" tab calls `getOverview` with `range: 30`.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement `OverviewPage.tsx`**

```tsx
import * as api from "@client/api";
import { DurationSelector, type DurationValue } from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import { OVERVIEW_RANGES } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import type React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { queryKeys } from "@/client/lib/queryKeys";
import { ActionTiles } from "./overview/ActionTiles";
import { EngineStatusStrip } from "./overview/EngineStatusStrip";
import { PaceCard } from "./overview/PaceCard";
import { PipelineCard } from "./overview/PipelineCard";
import { RepliesCard } from "./overview/RepliesCard";
import { RolesCard } from "./overview/RolesCard";
import { ScoreBandsCard } from "./overview/ScoreBandsCard";
import { SectionHeader } from "./overview/SectionHeader";
import { SkipsCard } from "./overview/SkipsCard";
import { SourceYieldTable } from "./overview/SourceYieldTable";

const DEFAULT_RANGE: DurationValue = 30;
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const OverviewPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = Number(searchParams.get("duration"));
  const range: DurationValue = (OVERVIEW_RANGES as readonly number[]).includes(fromUrl)
    ? (fromUrl as DurationValue)
    : DEFAULT_RANGE;

  const setRange = (next: DurationValue) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === DEFAULT_RANGE) params.delete("duration");
      else params.set("duration", String(next));
      return params;
    });

  const overview = useQuery({
    queryKey: queryKeys.overview.data(range),
    queryFn: () => api.getOverview({ range, timeZone }),
  });
  const progress = useQuery({
    queryKey: queryKeys.pipeline.progressSnapshot(),
    queryFn: api.getPipelineProgressSnapshot,
    refetchInterval: 15_000,
  });
  const status = useQuery({
    queryKey: queryKeys.pipeline.status(),
    queryFn: api.getPipelineStatus,
    refetchInterval: 30_000,
  });
  const schedule = useQuery({
    queryKey: queryKeys.pipeline.schedule(),
    queryFn: api.getSearchSchedule,
  });
  useQueryErrorToast(overview.error, "Failed to load the overview");

  const challenge =
    progress.data?.step === "challenge_required"
      ? (progress.data.pendingChallenges?.[0] ?? null)
      : null;
  const data = overview.data;

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Overview"
        subtitle="Your search at a glance"
        actions={<DurationSelector value={range} onChange={setRange} />}
      />
      <PageMain className="space-y-10">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {overview.isLoading ? "Loading…" : "The overview couldn't be loaded."}
          </p>
        ) : (
          <>
            <section aria-labelledby="ov-pipeline">
              <SectionHeader index="01" title="Pipeline" id="ov-pipeline" />
              <PipelineCard pipeline={data.pipeline} />
            </section>

            <section aria-labelledby="ov-action">
              <SectionHeader index="02" title="Needs your action" id="ov-action" />
              <ActionTiles
                actions={data.actions}
                challenge={challenge ? { extractorName: challenge.extractorName } : null}
              />
              <EngineStatusStrip
                schedule={schedule.data ?? null}
                lastRun={status.data?.lastRun ?? null}
                allJobsCount={data.actions.allJobsCount}
              />
            </section>

            <section aria-labelledby="ov-insights" className="space-y-4">
              <SectionHeader index="03" title="Insights" id="ov-insights" />
              <div className="grid gap-4 lg:grid-cols-2">
                <PaceCard pace={data.pace} />
                <RepliesCard replies={data.replies} />
                <RolesCard />
                <SkipsCard range={range} highScoreSkipped={data.skips.highScoreSkipped} />
              </div>
              <SourceYieldTable rows={data.sources.rows} />
              <ScoreBandsCard rows={data.scoreBands.rows} />
            </section>
          </>
        )}
      </PageMain>
    </>
  );
};
```

Check that `PageMain` accepts `className`. If it doesn't, wrap the children in `<div className="space-y-10">`. `SkipsCard`'s `range` prop isn't needed if it invalidates `queryKeys.overview.all`. Remove the prop from the component, the test and this call if it's unused.

- [ ] **Step 4: Swap the route.** In `App.tsx`, `/overview` now renders `<OverviewPage />`, and `/overview/classic` stays on `ClassicOverviewPage`. Update `App.test.tsx` to mock `./pages/OverviewPage` the same way.

- [ ] **Step 5: Run the tests.** Run `npx vitest run src/client/pages/OverviewPage.test.tsx src/client/pages/overview src/client/App.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit.** Message: `feat(overview): new Overview page at /overview`.

---

### Task 9: Verification

- [ ] **Step 1: Run the checks.** Run `npm run check:types` and `npm run check:all` (format with `biome check --write` if needed and commit as `style: format`). Then run `cd orchestrator && npx vitest run`. Expected: everything passes apart from the 2 known `ApplicationsPerDayChart` failures.

- [ ] **Step 2: Check it in demo mode** (a fresh temporary `DATA_DIR`, never the real database).

```bash
cd orchestrator && DATA_DIR=<tmp> npm run db:migrate
DATA_DIR=<tmp> DEMO_MODE=true PORT=3001 npm run dev
```

Take screenshots of `/overview` at 1440px and 390px, in dark and light themes. Use headless Chromium via Playwright from the repo's `node_modules/playwright`, with `executablePath` pointing at the installed `~/Library/Caches/ms-playwright/chromium_headless_shell-1228/...` binary. Check:
- the bar segments and legend colours match the board's lanes;
- the tiles wrap on mobile, with no horizontal scroll;
- empty states show "—" and hints rather than 0% bars;
- `/overview/classic` still renders the old page.

Stop the server.

- [ ] **Step 3: Report** the test results and screenshots to the user. Don't push.

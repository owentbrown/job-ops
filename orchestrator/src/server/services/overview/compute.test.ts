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

const job = (
  over: Partial<OverviewJobRow> & { id: string },
): OverviewJobRow => ({
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
      buckets: {
        awaiting: 2,
        screening: 1,
        interview: 0,
        offer: 0,
        rejected: 1,
      },
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
    expect(result.pace.perDay.find((d) => d.date === "2026-11-11")?.count).toBe(
      2,
    );
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
          job({
            id: "2",
            source: "linkedin",
            appliedAt: null,
            status: "discovered",
          }),
          job({ id: "3", source: "indeed" }),
          job({
            id: "4",
            source: "indeed",
            discoveredAt: iso(100),
            appliedAt: null,
          }),
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
          job({
            id: "low",
            status: "skipped",
            appliedAt: null,
            suitabilityScore: 79,
          }),
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

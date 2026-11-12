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

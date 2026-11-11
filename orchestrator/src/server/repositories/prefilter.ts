import type { PrefilterLayer } from "@shared/types";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { privateDataScopeFilter } from "../tenancy/private-scope";

const { jobs } = schema;

export type FilteredJobSummary = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  salary: string | null;
  jobUrl: string;
  filterReason: string | null;
  filterLayer: PrefilterLayer | null;
  filteredAt: string | null;
  discoveredAt: string;
};

const ACTIVE_FILTER_LAYERS = [
  "rules",
  "llm",
] as const satisfies readonly PrefilterLayer[];

export async function markJobFiltered(input: {
  id: string;
  layer: Exclude<PrefilterLayer, "restored">;
  reason: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(jobs)
    .set({
      status: "skipped",
      // A job that was already scored keeps its scoring reason, so a restore
      // brings it back intact.
      suitabilityReason: sql`CASE WHEN ${jobs.suitabilityScore} IS NULL THEN ${`Filtered (${input.layer}): ${input.reason}`} ELSE ${jobs.suitabilityReason} END`,
      filterReason: input.reason,
      filterLayer: input.layer,
      filteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.id, input.id),
        eq(jobs.status, "discovered"),
        or(isNull(jobs.filterLayer), ne(jobs.filterLayer, "restored")),
      ),
    );
  return result.changes > 0;
}

export async function listFilteredJobs(): Promise<FilteredJobSummary[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      employer: jobs.employer,
      location: jobs.location,
      salary: jobs.salary,
      jobUrl: jobs.jobUrl,
      filterReason: jobs.filterReason,
      filterLayer: jobs.filterLayer,
      filteredAt: jobs.filteredAt,
      discoveredAt: jobs.discoveredAt,
    })
    .from(jobs)
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.status, "skipped"),
        inArray(jobs.filterLayer, [...ACTIVE_FILTER_LAYERS]),
      ),
    )
    .orderBy(desc(jobs.filteredAt));
  return rows.map((row) => ({
    ...row,
    filterLayer: (row.filterLayer as PrefilterLayer | null) ?? null,
  }));
}

/** Put a filtered job back in the scoring queue. filterReason is kept for history. */
export async function restoreFilteredJob(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(jobs)
    .set({
      status: "discovered",
      suitabilityReason: sql`CASE WHEN ${jobs.suitabilityReason} LIKE 'Filtered (%' THEN NULL ELSE ${jobs.suitabilityReason} END`,
      filterLayer: "restored",
      updatedAt: now,
    })
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.id, id),
        eq(jobs.status, "skipped"),
        inArray(jobs.filterLayer, [...ACTIVE_FILTER_LAYERS]),
      ),
    );
  return result.changes > 0;
}

/** Saves (or clears, with null) the note typed when skipping a job. Only skipped jobs. */
export async function setSkipReason(
  id: string,
  reason: string | null,
): Promise<boolean> {
  const result = await db
    .update(jobs)
    .set({ skipReason: reason, updatedAt: new Date().toISOString() })
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.id, id),
        eq(jobs.status, "skipped"),
      ),
    );
  return result.changes > 0;
}

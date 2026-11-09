import type { PrefilterLayer } from "@shared/types";
import { and, desc, eq, inArray } from "drizzle-orm";
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

const ACTIVE_FILTER_LAYERS = ["rules", "llm"] as const;

export async function markJobFiltered(input: {
  id: string;
  layer: "rules" | "llm";
  reason: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(jobs)
    .set({
      status: "skipped",
      suitabilityReason: `Filtered (${input.layer}): ${input.reason}`,
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
      suitabilityReason: null,
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

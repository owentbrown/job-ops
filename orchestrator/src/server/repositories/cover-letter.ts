import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { privateDataScopeFilter } from "../tenancy/private-scope";

const { jobs } = schema;

/** Saves (or clears, with null) the approved cover letter text for a job. */
export async function setCoverLetter(
  id: string,
  text: string | null,
): Promise<boolean> {
  const result = await db
    .update(jobs)
    .set({ coverLetter: text, updatedAt: new Date().toISOString() })
    .where(and(privateDataScopeFilter(jobs), eq(jobs.id, id)));
  return result.changes > 0;
}

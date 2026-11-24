import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import type { JobJot, PrepKit, PrepKitContent } from "@shared/types";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/index";
import {
  getPrivateDataScope,
  privateDataScopeFilter,
} from "../tenancy/private-scope";

const { jobPrepKits, jobJots } = schema;

function parseContent(raw: string, jobId: string): PrepKitContent {
  try {
    const parsed = JSON.parse(raw) as Partial<PrepKitContent>;
    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch (error) {
    logger.warn("Ignoring unreadable prep kit", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sections: [], questions: [] };
  }
}

export async function getPrepKit(jobId: string): Promise<PrepKit | null> {
  const [row] = await db
    .select()
    .from(jobPrepKits)
    .where(
      and(privateDataScopeFilter(jobPrepKits), eq(jobPrepKits.jobId, jobId)),
    )
    .orderBy(desc(jobPrepKits.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    jobId: row.jobId,
    ...parseContent(row.content, row.jobId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Creates the job's kit or replaces its content. */
export async function savePrepKit(
  jobId: string,
  content: PrepKitContent,
): Promise<PrepKit> {
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    sections: content.sections,
    questions: content.questions,
  });
  const [existing] = await db
    .select({ id: jobPrepKits.id, createdAt: jobPrepKits.createdAt })
    .from(jobPrepKits)
    .where(
      and(privateDataScopeFilter(jobPrepKits), eq(jobPrepKits.jobId, jobId)),
    )
    .limit(1);

  if (existing) {
    await db
      .update(jobPrepKits)
      .set({ content: payload, updatedAt: now })
      .where(
        and(
          privateDataScopeFilter(jobPrepKits),
          eq(jobPrepKits.id, existing.id),
        ),
      );
    return { jobId, ...content, createdAt: existing.createdAt, updatedAt: now };
  }

  const scope = getPrivateDataScope();
  await db.insert(jobPrepKits).values({
    id: randomUUID(),
    tenantId: scope.tenantId,
    userId: scope.userId,
    jobId,
    content: payload,
    createdAt: now,
    updatedAt: now,
  });
  return { jobId, ...content, createdAt: now, updatedAt: now };
}

function toJot(row: typeof jobJots.$inferSelect): JobJot {
  return {
    id: row.id,
    jobId: row.jobId,
    text: row.text,
    sectionHint: row.sectionHint ?? null,
    createdAt: row.createdAt,
    wrappedUpAt: row.wrappedUpAt ?? null,
  };
}

/** Jots not yet wrapped up, oldest first. */
export async function listOpenJots(jobId: string): Promise<JobJot[]> {
  const rows = await db
    .select()
    .from(jobJots)
    .where(
      and(
        privateDataScopeFilter(jobJots),
        eq(jobJots.jobId, jobId),
        isNull(jobJots.wrappedUpAt),
      ),
    )
    .orderBy(asc(jobJots.createdAt), asc(jobJots.id));
  return rows.map(toJot);
}

export async function createJot(input: {
  jobId: string;
  text: string;
  sectionHint: string | null;
}): Promise<JobJot> {
  const scope = getPrivateDataScope();
  const row = {
    id: randomUUID(),
    tenantId: scope.tenantId,
    userId: scope.userId,
    jobId: input.jobId,
    text: input.text,
    sectionHint: input.sectionHint,
    createdAt: new Date().toISOString(),
    wrappedUpAt: null,
  };
  await db.insert(jobJots).values(row);
  return toJot(row);
}

export async function updateJot(input: {
  jobId: string;
  jotId: string;
  text: string;
}): Promise<JobJot | null> {
  await db
    .update(jobJots)
    .set({ text: input.text })
    .where(
      and(
        privateDataScopeFilter(jobJots),
        eq(jobJots.jobId, input.jobId),
        eq(jobJots.id, input.jotId),
      ),
    );
  const [row] = await db
    .select()
    .from(jobJots)
    .where(
      and(
        privateDataScopeFilter(jobJots),
        eq(jobJots.jobId, input.jobId),
        eq(jobJots.id, input.jotId),
      ),
    );
  return row ? toJot(row) : null;
}

export async function deleteJot(jobId: string, jotId: string): Promise<number> {
  const result = await db
    .delete(jobJots)
    .where(
      and(
        privateDataScopeFilter(jobJots),
        eq(jobJots.jobId, jobId),
        eq(jobJots.id, jotId),
      ),
    );
  return result.changes;
}

export async function markJotsWrappedUp(
  jobId: string,
  jotIds: readonly string[],
): Promise<void> {
  if (jotIds.length === 0) return;
  await db
    .update(jobJots)
    .set({ wrappedUpAt: new Date().toISOString() })
    .where(
      and(
        privateDataScopeFilter(jobJots),
        eq(jobJots.jobId, jobId),
        inArray(jobJots.id, [...jotIds]),
      ),
    );
}

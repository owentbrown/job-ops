import { randomUUID } from "node:crypto";
import {
  BrandEntrySchema,
  PitchEntrySchema,
  type ProfileEntryKind,
  ProfileEntryKindSchema,
  type ProfileEntryRow,
  type ProfileSingletonKind,
  SkillsEntrySchema,
  type StoryEntry,
  StoryEntrySchema,
  ValuesEntrySchema,
} from "@shared/types";
import { and, asc, eq, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "../db/index";
import {
  getPrivateDataScope,
  type PrivateDataScope,
} from "../tenancy/private-scope";

const { profileEntries } = schema;

const KIND_SCHEMAS: Record<ProfileEntryKind, z.ZodTypeAny> = {
  brand: BrandEntrySchema,
  pitch: PitchEntrySchema,
  values: ValuesEntrySchema,
  story: StoryEntrySchema,
  skills: SkillsEntrySchema,
};

/**
 * Same rule as privateDataScopeFilter (tenant always; user too when hosted
 * isolation is on), but against an explicit scope so callers can resolve it
 * once. Defaults to the active request scope.
 */
function scopeFilter(scope: PrivateDataScope): SQL {
  const filters = [eq(profileEntries.tenantId, scope.tenantId)];
  if (scope.enforceUserIsolation && scope.userId) {
    filters.push(eq(profileEntries.userId, scope.userId));
  }
  return and(...filters) as SQL;
}

function toRow<TData>(
  row: typeof profileEntries.$inferSelect,
): ProfileEntryRow<TData> {
  return {
    id: row.id,
    kind: ProfileEntryKindSchema.parse(row.kind),
    data: row.data as TData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All of the scope's entries, oldest first. */
export async function listEntries(
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<ProfileEntryRow[]> {
  const rows = await db
    .select()
    .from(profileEntries)
    .where(scopeFilter(scope))
    .orderBy(asc(profileEntries.createdAt), asc(profileEntries.id));
  return rows.map((row) => toRow(row));
}

export async function getSingleton<TData = unknown>(
  kind: ProfileSingletonKind,
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<ProfileEntryRow<TData> | null> {
  const [row] = await db
    .select()
    .from(profileEntries)
    .where(and(scopeFilter(scope), eq(profileEntries.kind, kind)))
    .orderBy(asc(profileEntries.createdAt), asc(profileEntries.id))
    .limit(1);
  return row ? toRow<TData>(row) : null;
}

/** Validates against the kind's schema (throws ZodError) and inserts or replaces. */
export async function upsertSingleton<TData = unknown>(
  kind: ProfileSingletonKind,
  data: unknown,
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<ProfileEntryRow<TData>> {
  const parsed = KIND_SCHEMAS[kind].parse(data);
  const now = new Date().toISOString();
  const existing = await getSingleton(kind, scope);
  if (existing) {
    await db
      .update(profileEntries)
      .set({ data: parsed, updatedAt: now })
      .where(and(scopeFilter(scope), eq(profileEntries.id, existing.id)));
    return { ...existing, data: parsed as TData, updatedAt: now };
  }
  const id = randomUUID();
  await db.insert(profileEntries).values({
    id,
    tenantId: scope.tenantId,
    userId: scope.userId,
    kind,
    data: parsed,
    createdAt: now,
    updatedAt: now,
  });
  return { id, kind, data: parsed as TData, createdAt: now, updatedAt: now };
}

export async function createStory(
  data: unknown,
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<ProfileEntryRow<StoryEntry>> {
  const parsed = StoryEntrySchema.parse(data);
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(profileEntries).values({
    id,
    tenantId: scope.tenantId,
    userId: scope.userId,
    kind: "story",
    data: parsed,
    createdAt: now,
    updatedAt: now,
  });
  return { id, kind: "story", data: parsed, createdAt: now, updatedAt: now };
}

/** Returns null when the story does not exist in this scope. */
export async function updateStory(
  id: string,
  data: unknown,
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<ProfileEntryRow<StoryEntry> | null> {
  const parsed = StoryEntrySchema.parse(data);
  const now = new Date().toISOString();
  const result = await db
    .update(profileEntries)
    .set({ data: parsed, updatedAt: now })
    .where(
      and(
        scopeFilter(scope),
        eq(profileEntries.id, id),
        eq(profileEntries.kind, "story"),
      ),
    );
  if (result.changes === 0) return null;
  const [row] = await db
    .select()
    .from(profileEntries)
    .where(and(scopeFilter(scope), eq(profileEntries.id, id)))
    .limit(1);
  return row ? toRow<StoryEntry>(row) : null;
}

/** Returns false when the story does not exist in this scope. */
export async function deleteStory(
  id: string,
  scope: PrivateDataScope = getPrivateDataScope(),
): Promise<boolean> {
  const result = await db
    .delete(profileEntries)
    .where(
      and(
        scopeFilter(scope),
        eq(profileEntries.id, id),
        eq(profileEntries.kind, "story"),
      ),
    );
  return result.changes > 0;
}

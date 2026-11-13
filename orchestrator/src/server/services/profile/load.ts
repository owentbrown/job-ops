/**
 * Reads the slim, scoped rows that computeProfileInsights needs: the design
 * resume, the searchTerms setting, the jobs (with their latest stage) and the
 * profile entries. Same scoping as the Overview (privateDataScopeFilter).
 */
import { db, schema } from "@server/db";
import { listEntries } from "@server/repositories/profile-entries";
import { getSetting } from "@server/repositories/settings";
import { getCurrentDesignResumeOrNullOnLegacy } from "@server/services/design-resume";
import { privateDataScopeFilter } from "@server/tenancy/private-scope";
import {
  type ApplicationStage,
  BrandEntrySchema,
  type DesignResumeJson,
  type JobStatus,
  PitchEntrySchema,
  type ProfileEntryRow,
  SkillsEntrySchema,
  type StoryEntry,
  StoryEntrySchema,
  ValuesEntrySchema,
} from "@shared/types";
import type {
  ProfileEntriesInput,
  ProfileInsightsInput,
  ProfileJobRow,
  ProfileResumeInput,
} from "./compute";

const { jobs, stageEvents } = schema;

type Loose = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function visibleItems(section: unknown): Loose[] {
  const items = (section as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is Loose =>
      !!item && typeof item === "object" && (item as Loose).hidden !== true,
  );
}

/**
 * Design resume (Reactive Resume v5 JSON) to the compute input. Hidden items
 * are skipped. An experience item with roles becomes one entry per role; the
 * item's own description is kept on the first role so no bullet is lost.
 */
export function toProfileResumeInput(
  resume: DesignResumeJson,
): ProfileResumeInput {
  const basics = (resume.basics ?? {}) as Partial<DesignResumeJson["basics"]>;
  const sections = (resume.sections ?? {}) as Partial<
    DesignResumeJson["sections"]
  >;

  const profiles = visibleItems(sections.profiles).map((p) => ({
    network: str(p.network),
    url: str((p.website as Loose | undefined)?.url),
  }));
  const websiteUrl = str(basics.website?.url);
  if (websiteUrl) {
    profiles.push({ network: str(basics.website?.label), url: websiteUrl });
  }

  const experience: ProfileResumeInput["experience"] = [];
  for (const item of visibleItems(sections.experience)) {
    const company = str(item.company);
    const roles = Array.isArray(item.roles)
      ? (item.roles as Loose[]).filter((r) => r && typeof r === "object")
      : [];
    if (roles.length === 0) {
      experience.push({
        position: str(item.position),
        company,
        period: str(item.period),
        description: str(item.description),
      });
      continue;
    }
    roles.forEach((role, index) => {
      const description =
        index === 0
          ? [str(item.description), str(role.description)]
              .filter((d) => d.trim())
              .join("\n")
          : str(role.description);
      experience.push({
        position: str(role.position) || str(item.position),
        company,
        period: str(role.period) || str(item.period),
        description,
      });
    });
  }

  const projects = visibleItems(sections.projects).map((p) => ({
    name: str(p.name),
    description: str(p.description),
  }));

  const skills: string[] = [];
  for (const item of visibleItems(sections.skills)) {
    if (str(item.name).trim()) skills.push(str(item.name).trim());
    if (Array.isArray(item.keywords)) {
      for (const k of item.keywords) {
        if (typeof k === "string" && k.trim()) skills.push(k.trim());
      }
    }
  }

  return {
    basics: {
      name: str(basics.name),
      headline: str(basics.headline),
      location: str(basics.location),
      email: str(basics.email),
      profiles,
    },
    summary: str((resume.summary as Loose | undefined)?.content),
    experience,
    projects,
    skills,
  };
}

/** Stored searchTerms, or [] when unset or unreadable (no env default). */
export async function loadSearchTerms(): Promise<string[]> {
  const raw = await getSetting("searchTerms");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        )
      : [];
  } catch {
    return [];
  }
}

/** Scoped jobs with their current stage (the latest stage event's toStage). */
export async function loadProfileJobs(): Promise<ProfileJobRow[]> {
  const [jobRows, eventRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        employer: jobs.employer,
        status: jobs.status,
        suitabilityScore: jobs.suitabilityScore,
        description: jobs.jobDescription,
        appliedAt: jobs.appliedAt,
      })
      .from(jobs)
      .where(privateDataScopeFilter(jobs)),
    db
      .select({
        applicationId: stageEvents.applicationId,
        toStage: stageEvents.toStage,
        occurredAt: stageEvents.occurredAt,
      })
      .from(stageEvents)
      .where(privateDataScopeFilter(stageEvents)),
  ]);

  const latest = new Map<string, { stage: string; at: number }>();
  for (const e of eventRows) {
    const prev = latest.get(e.applicationId);
    if (!prev || e.occurredAt >= prev.at) {
      latest.set(e.applicationId, { stage: e.toStage, at: e.occurredAt });
    }
  }

  return jobRows.map((row) => ({
    id: row.id,
    title: row.title,
    employer: row.employer,
    status: row.status as JobStatus,
    suitabilityScore: row.suitabilityScore ?? null,
    description: row.description ?? null,
    appliedAt: row.appliedAt ?? null,
    stage: (latest.get(row.id)?.stage as ApplicationStage | undefined) ?? null,
  }));
}

function parseOrNull<T>(
  schemaDef: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T | null {
  const result = schemaDef.safeParse(value);
  return result.success ? (result.data as T) : null;
}

/**
 * Entries grouped by kind. Rows that no longer match their schema are skipped
 * rather than failing the whole page.
 */
export async function loadProfileEntries(): Promise<ProfileEntriesInput> {
  const rows = await listEntries();
  const singleton = (kind: string) => rows.find((r) => r.kind === kind);
  const singletonRows = rows.filter((r) => r.kind !== "story");

  const stories: ProfileEntryRow<StoryEntry>[] = [];
  for (const row of rows) {
    if (row.kind !== "story") continue;
    const data = parseOrNull<StoryEntry>(StoryEntrySchema, row.data);
    if (data) stories.push({ ...row, data });
  }

  const singletonsUpdatedAt =
    singletonRows.length === 0
      ? null
      : singletonRows.map((r) => r.updatedAt).reduce((a, b) => (a > b ? a : b));

  return {
    brand: parseOrNull(BrandEntrySchema, singleton("brand")?.data),
    pitch: parseOrNull(PitchEntrySchema, singleton("pitch")?.data),
    values: parseOrNull(ValuesEntrySchema, singleton("values")?.data),
    skills: parseOrNull(SkillsEntrySchema, singleton("skills")?.data),
    stories,
    singletonsUpdatedAt,
  };
}

export async function loadProfileInsightsInput(args?: {
  now?: Date;
}): Promise<ProfileInsightsInput> {
  const [document, searchTerms, jobRows, entries] = await Promise.all([
    getCurrentDesignResumeOrNullOnLegacy(),
    loadSearchTerms(),
    loadProfileJobs(),
    loadProfileEntries(),
  ]);

  return {
    resume: document ? toProfileResumeInput(document.resumeJson) : null,
    resumeUpdatedAt: document?.updatedAt ?? null,
    searchTerms,
    jobs: jobRows,
    entries,
    now: args?.now ?? new Date(),
  };
}

/**
 * AI skill refresh for Profile › About you. Runs only when the user clicks:
 * sends up to 40 best-fit job descriptions plus the current skill list to the
 * configured "scoring" model, then merges the returned skills into the
 * user's `skills` entry.
 *
 * Usage is recorded by LlmService itself (llm/usage.ts) under the
 * "profile_skills" feature, so it shows in Spend.
 */
import { badRequest, conflict, upstreamError } from "@infra/errors";
import { logger } from "@infra/logger";
import {
  getSingleton,
  upsertSingleton,
} from "@server/repositories/profile-entries";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import { starterSkillItems } from "@shared/profile/starter-skills";
import {
  type ProfileSkillsRefreshResponse,
  type SkillItem,
  type SkillsEntry,
  SkillsEntrySchema,
} from "@shared/types";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import { bestFitJobs, htmlToText, type ProfileJobRow } from "./compute";
import { loadProfileJobs } from "./load";

export const MAX_REFRESH_JOBS = 40;
export const MAX_DESCRIPTION_CHARS = 1500;
export const MAX_AI_SKILLS = 20;
const MAX_ITEMS = 60;
const MAX_KEYWORDS = 40;
const MAX_LABEL = 120;
const MAX_KEYWORD = 80;

export type AiSkill = { label: string; keywords: string[] };

const SKILLS_SCHEMA: JsonSchemaDefinition = {
  name: "profile_skills",
  schema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        description: `Up to ${MAX_AI_SKILLS} skill groups the jobs ask for`,
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Short skill group name, e.g. Roadmap & prioritization",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description:
                "Plain words or phrases that show the skill in a job description. End a word start with * to match every ending, e.g. prioriti*",
            },
          },
          required: ["label", "keywords"],
          additionalProperties: false,
        },
      },
    },
    required: ["skills"],
    additionalProperties: false,
  },
};

/** The stored list, or the starter groups when nothing is saved yet. */
export function currentSkillItems(skills: SkillsEntry | null): SkillItem[] {
  if (skills) return skills.items;
  return starterSkillItems();
}

/** Highest-scoring best-fit jobs first, as plain text trimmed to 1,500 chars. */
export function selectRefreshDescriptions(jobs: ProfileJobRow[]): string[] {
  return [...bestFitJobs(jobs)]
    .sort((a, b) => (b.suitabilityScore ?? -1) - (a.suitabilityScore ?? -1))
    .map((job) => htmlToText(job.description ?? ""))
    .filter((text) => text.length > 0)
    .slice(0, MAX_REFRESH_JOBS)
    .map((text) => text.slice(0, MAX_DESCRIPTION_CHARS));
}

/** Trim, dedupe and cap what the model returned. Bad items are dropped. */
export function sanitizeAiSkills(raw: unknown): AiSkill[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AiSkill[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "")
      .trim()
      .slice(0, MAX_LABEL);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    const rawKeywords = (item as { keywords?: unknown }).keywords;
    const keywords: string[] = [];
    const seenKw = new Set<string>();
    for (const kw of Array.isArray(rawKeywords) ? rawKeywords : []) {
      if (typeof kw !== "string") continue;
      const term = kw.trim().slice(0, MAX_KEYWORD);
      if (!term || seenKw.has(term.toLowerCase())) continue;
      seenKw.add(term.toLowerCase());
      keywords.push(term);
      if (keywords.length >= MAX_KEYWORDS) break;
    }
    if (keywords.length === 0) continue;
    seen.add(key);
    out.push({ label, keywords });
    if (out.length >= MAX_AI_SKILLS) break;
  }
  return out;
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Merge rules:
 * - `user` items and hidden items are kept as they are;
 * - a starter/ai item whose label matches an AI skill (case-insensitive)
 *   keeps its id and gets the new keywords;
 * - other starter/ai items are replaced by the AI's list;
 * - AI skills with no match are added as `source: "ai"`.
 * Existing order is kept; new items go at the end. The list stays within 60.
 */
export function mergeRefreshedSkills(
  current: SkillItem[],
  aiSkills: AiSkill[],
  refreshedAt: string,
): { entry: SkillsEntry; added: number; updated: number } {
  const aiByLabel = new Map(aiSkills.map((s) => [s.label.toLowerCase(), s]));
  const claimed = new Set<string>();
  const items: SkillItem[] = [];
  let updated = 0;

  for (const item of current) {
    const key = item.label.trim().toLowerCase();
    const protectedItem = item.source === "user" || item.hidden;
    const match = aiByLabel.get(key);
    if (protectedItem) {
      items.push(item);
      if (match) claimed.add(key);
      continue;
    }
    if (match && !claimed.has(key)) {
      claimed.add(key);
      items.push({ ...item, keywords: match.keywords });
      updated++;
    }
  }

  const ids = new Set(items.map((i) => i.id));
  let added = 0;
  for (const skill of aiSkills) {
    const key = skill.label.toLowerCase();
    if (claimed.has(key)) continue;
    if (items.length >= MAX_ITEMS) break;
    const base = `ai-${slug(skill.label) || "skill"}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    claimed.add(key);
    items.push({
      id,
      label: skill.label,
      keywords: skill.keywords,
      hidden: false,
      source: "ai",
    });
    added++;
  }

  return {
    entry: SkillsEntrySchema.parse({ items, refreshedAt }),
    added,
    updated,
  };
}

function buildPrompt(descriptions: string[], current: SkillItem[]): string {
  const list = current.map((item) => ({
    label: item.label,
    keywords: item.keywords,
    ...(item.hidden ? { hiddenByUser: true } : {}),
  }));
  const jobs = descriptions
    .map((text, i) => `### Job ${i + 1}\n${text}`)
    .join("\n\n");
  return [
    "You help a job seeker see which skills their target jobs ask for.",
    `Read the job descriptions below and return up to ${MAX_AI_SKILLS} skill groups that these jobs ask for most often, most common first.`,
    "For each group give a short label and the plain words or phrases (keywords) that show the skill in a job description.",
    "Keywords are matched case-insensitively as whole words, so use terms that literally appear in job text (e.g. 'roadmap', 'stakeholder', 'SQL'), not descriptions. Give 2 to 8 keywords per group.",
    "To match the start of a word, end the keyword with * (e.g. 'prioriti*' matches 'prioritize' and 'prioritization'). Keep keywords that already end in * when you reuse them.",
    "Reuse a label from the current list, spelled exactly the same, when it is the same skill. Do not return skills marked hiddenByUser.",
    "",
    "## Current skill list",
    JSON.stringify(list),
    "",
    "## Job descriptions",
    jobs,
  ].join("\n");
}

const running = new Set<string>();

export async function refreshProfileSkills(args?: {
  now?: () => Date;
}): Promise<ProfileSkillsRefreshResponse> {
  const scope = getPrivateDataScope();
  if (running.has(scope.scopeKey)) {
    throw conflict("A skill refresh is already running.");
  }
  running.add(scope.scopeKey);
  try {
    const [jobs, stored] = await Promise.all([
      loadProfileJobs(),
      getSingleton<SkillsEntry>("skills", scope),
    ]);
    const descriptions = selectRefreshDescriptions(jobs);
    if (descriptions.length === 0) {
      throw badRequest(
        "No scored jobs with descriptions yet. Score some jobs, then refresh.",
      );
    }
    const current = currentSkillItems(
      stored ? SkillsEntrySchema.parse(stored.data) : null,
    );

    const [model, llm] = await Promise.all([
      resolveLlmModel("scoring"),
      createConfiguredLlmService("scoring"),
    ]);
    const result = await llm.callJson<{ skills: unknown }>({
      feature: "profile_skills",
      model,
      messages: [{ role: "user", content: buildPrompt(descriptions, current) }],
      jsonSchema: SKILLS_SCHEMA,
      maxRetries: 1,
      retryDelayMs: 300,
    });

    if (!result.success) {
      logger.warn("Profile skill refresh failed", { error: result.error });
      throw upstreamError("AI skill refresh failed", { reason: result.error });
    }
    const aiSkills = sanitizeAiSkills(result.data?.skills);
    if (aiSkills.length === 0) {
      throw upstreamError("AI skill refresh returned no usable skills");
    }

    const refreshedAt = (args?.now?.() ?? new Date()).toISOString();
    const { entry, added, updated } = mergeRefreshedSkills(
      current,
      aiSkills,
      refreshedAt,
    );
    await upsertSingleton("skills", entry, scope);
    return {
      skills: entry,
      added,
      updated,
      jobsUsed: descriptions.length,
    };
  } finally {
    running.delete(scope.scopeKey);
  }
}

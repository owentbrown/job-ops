/**
 * Proof points: things the user did, typed in their own words in About you,
 * turned into structured entries (title, role, skills, keywords, metric).
 *
 * - draftProofPoints: one AI call that splits the user's text into one or more
 *   drafts. Nothing is saved; the user reviews and saves each draft.
 * - saveProofPoint / updateSavedProofPoint: store it and merge its skills into
 *   the skill map, so the user never chooses between "skill" and "story".
 * - proofPointsForJob: picks the saved points whose keywords appear in a job,
 *   for job scoring, cover letters and Ghostwriter.
 *
 * Usage of the AI call is recorded under "profile_writing" (shown on Spend).
 */
import { upstreamError } from "@infra/errors";
import { logger } from "@infra/logger";
import {
  createProofPoint,
  getSingleton,
  listEntries,
  updateProofPoint,
  upsertSingleton,
} from "@server/repositories/profile-entries";
import {
  parseSavedKeyword,
  starterSkillItems,
} from "@shared/profile/starter-skills";
import {
  type ProfileEntryRow,
  type ProofPointEntry,
  ProofPointEntrySchema,
  type SkillItem,
  type SkillsEntry,
  SkillsEntrySchema,
} from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import { htmlToText, matchSkill, splitBullets } from "./compute";
import { loadProfileInsightsInput } from "./load";

const MAX_DRAFTS = 8;
const MAX_ROLES = 12;
const MAX_ROLE_BULLETS = 4;
const MAX_SKILL_ITEMS = 60;
const MAX_SKILL_KEYWORDS = 40;

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

const DRAFT_SCHEMA: JsonSchemaDefinition = {
  name: "proof_points",
  schema: {
    type: "object",
    properties: {
      points: {
        type: "array",
        description:
          "One item per distinct accomplishment or area of experience in the user's text",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "A short headline of what they did, 4 to 9 words, no trailing period",
            },
            text: {
              type: "string",
              description:
                "The point in the user's own words, tidied into one or two clear sentences. Keep every fact; add none.",
            },
            role: {
              type: "string",
              description:
                "Exactly one of the listed roles when the text or resume makes it clear; otherwise empty",
            },
            skills: {
              type: "array",
              description: "1 to 5 skills this proves",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description:
                      "Skill name. Reuse an existing skill label when one fits.",
                  },
                  keywords: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "2 to 6 terms a job description would use for this skill",
                  },
                },
                required: ["label", "keywords"],
                additionalProperties: false,
              },
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description:
                "6 to 16 terms a matching job posting would use, including common synonyms and acronyms (e.g. 'privacy impact assessment', 'PIA')",
            },
            metric: {
              type: "string",
              description:
                "A number the user actually stated, e.g. '40+ reviews a year'. Empty string when there is none.",
            },
            followUps: {
              type: "array",
              items: { type: "string" },
              description:
                "Up to 3 short questions that would make this stronger, e.g. scale, outcome, a number",
            },
          },
          required: [
            "title",
            "text",
            "role",
            "skills",
            "keywords",
            "metric",
            "followUps",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["points"],
    additionalProperties: false,
  },
};

export function buildDraftPrompt(args: {
  text: string;
  roles: string[];
  roleNotes: string[];
  skillLabels: string[];
}): string {
  return [
    "You turn a job seeker's own notes about their experience into structured proof points for their profile.",
    "A proof point is one thing they did that shows a skill. Recruiters, job scoring and cover letters will use it, so it must be accurate.",
    "",
    "## Rules",
    "- Never invent facts, employers, numbers or outcomes. Use only what the user wrote (and the resume, only to identify the role).",
    "- Split the text into separate points only when it covers clearly different accomplishments; a single bullet is usually one point.",
    "- Keep the user's meaning and wording where it works; tidy grammar only.",
    "- Keywords should be terms hiring managers write in job postings, including synonyms and acronyms, so the point can be matched to jobs.",
    "- Reuse an existing skill label when it fits; otherwise name the skill plainly (2 to 4 words).",
    "",
    "## Roles on the resume",
    args.roles.length > 0
      ? args.roles.map((r, i) => `- ${r}${args.roleNotes[i] ? ` — ${args.roleNotes[i]}` : ""}`).join("\n")
      : "(none)",
    "",
    "## Existing skill labels",
    args.skillLabels.length > 0 ? args.skillLabels.join(", ") : "(none)",
    "",
    "## The user's text",
    args.text,
  ].join("\n");
}

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = clean(item, maxLen);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Trims and validates the model's output; drops points that don't hold up. */
export function sanitizeDrafts(raw: unknown, roles: string[]): ProofPointEntry[] {
  const points = (raw as { points?: unknown })?.points;
  if (!Array.isArray(points)) return [];
  const roleByKey = new Map(roles.map((r) => [r.toLowerCase(), r]));
  const drafts: ProofPointEntry[] = [];
  for (const item of points) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const role = roleByKey.get(clean(p.role, 200).toLowerCase()) ?? null;
    const skills = Array.isArray(p.skills)
      ? p.skills
          .map((s) => {
            const skill = (s ?? {}) as Record<string, unknown>;
            return {
              label: clean(skill.label, 120),
              keywords: cleanList(skill.keywords, 12, 80),
            };
          })
          .filter((s) => s.label)
          .slice(0, 8)
      : [];
    const candidate = {
      title: clean(p.title, 200),
      text: clean(p.text, 2000),
      role,
      skills,
      keywords: cleanList(p.keywords, 24, 80),
      metric: clean(p.metric, 200) || null,
      followUps: cleanList(p.followUps, 5, 300),
      source: "ai" as const,
    };
    const parsed = ProofPointEntrySchema.safeParse(candidate);
    if (parsed.success) drafts.push(parsed.data);
    if (drafts.length >= MAX_DRAFTS) break;
  }
  return drafts;
}

export async function draftProofPoints(
  text: string,
): Promise<{ drafts: ProofPointEntry[]; roles: string[] }> {
  const input = await loadProfileInsightsInput();
  const experience = (input.resume?.experience ?? []).slice(0, MAX_ROLES);
  const roles = experience
    .map((e) =>
      [e.position, e.company && `at ${e.company}`].filter(Boolean).join(" "),
    )
    .filter(Boolean);
  const roleNotes = experience.map((e) =>
    [
      e.period,
      ...splitBullets(e.description)
        .slice(0, MAX_ROLE_BULLETS)
        .map((b) => htmlToText(b).slice(0, 160)),
    ]
      .filter(Boolean)
      .join("; "),
  );
  const skillLabels = (input.entries.skills?.items ?? starterSkillItems())
    .filter((s) => !s.hidden)
    .map((s) => s.label);

  const [model, llm] = await Promise.all([
    resolveLlmModel("tailoring"),
    createConfiguredLlmService("tailoring"),
  ]);
  const result = await llm.callJson<unknown>({
    feature: "profile_writing",
    model,
    messages: [
      {
        role: "user",
        content: buildDraftPrompt({ text, roles, roleNotes, skillLabels }),
      },
    ],
    jsonSchema: DRAFT_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 300,
  });
  if (!result.success) {
    logger.warn("Proof point drafting failed", { error: result.error });
    throw upstreamError("AI drafting failed", { reason: result.error });
  }
  const drafts = sanitizeDrafts(result.data, roles);
  if (drafts.length === 0) {
    throw upstreamError("AI drafting returned no proof points");
  }
  return { drafts, roles };
}

// ---------------------------------------------------------------------------
// Saving: merge the point's skills into the skill map
// ---------------------------------------------------------------------------

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "skill"
  );
}

/**
 * Adds a proof point's skills to the saved skill list. A skill with the same
 * label (any case) gains the new keywords; a new one is added as a user skill.
 * With no saved list yet, the starter list is the base, so it isn't lost.
 */
export function mergeProofSkills(
  current: SkillsEntry | null,
  skills: ProofPointEntry["skills"],
): SkillsEntry {
  const items: SkillItem[] = (current?.items ?? starterSkillItems()).map(
    (item) => ({ ...item, keywords: [...item.keywords] }),
  );
  for (const skill of skills) {
    const label = skill.label.trim();
    if (!label) continue;
    const existing = items.find(
      (item) => item.label.toLowerCase() === label.toLowerCase(),
    );
    const keywords = [label, ...skill.keywords]
      .map((k) => k.trim())
      .filter(Boolean);
    if (existing) {
      const have = new Set(
        existing.keywords.map((k) => parseSavedKeyword(k).term.toLowerCase()),
      );
      for (const k of keywords) {
        if (existing.keywords.length >= MAX_SKILL_KEYWORDS) break;
        if (!have.has(k.toLowerCase())) {
          existing.keywords.push(k);
          have.add(k.toLowerCase());
        }
      }
      continue;
    }
    if (items.length >= MAX_SKILL_ITEMS) continue;
    const ids = new Set(items.map((i) => i.id));
    let id = slugify(label);
    for (let n = 2; ids.has(id); n++) id = `${slugify(label)}-${n}`;
    items.push({
      id,
      label,
      keywords: [...new Set(keywords)].slice(0, MAX_SKILL_KEYWORDS),
      hidden: false,
      source: "user",
    });
  }
  return SkillsEntrySchema.parse({
    items,
    refreshedAt: current?.refreshedAt ?? null,
  });
}

async function mergeSkillsIntoMap(point: ProofPointEntry): Promise<void> {
  if (point.skills.length === 0) return;
  const current = await getSingleton<SkillsEntry>("skills");
  const parsed = current
    ? SkillsEntrySchema.safeParse(current.data)
    : ({ success: true, data: null } as const);
  if (!parsed.success) return;
  await upsertSingleton("skills", mergeProofSkills(parsed.data, point.skills));
}

export async function saveProofPoint(
  data: unknown,
): Promise<ProfileEntryRow<ProofPointEntry>> {
  const row = await createProofPoint(data);
  await mergeSkillsIntoMap(row.data);
  return row;
}

export async function updateSavedProofPoint(
  id: string,
  data: unknown,
): Promise<ProfileEntryRow<ProofPointEntry> | null> {
  const row = await updateProofPoint(id, data);
  if (row) await mergeSkillsIntoMap(row.data);
  return row;
}

// ---------------------------------------------------------------------------
// Using them: pick the points that fit a job
// ---------------------------------------------------------------------------

export async function loadProofPoints(): Promise<ProofPointEntry[]> {
  try {
    const rows = await listEntries();
    const points: ProofPointEntry[] = [];
    for (const row of rows) {
      if (row.kind !== "proof") continue;
      const parsed = ProofPointEntrySchema.safeParse(row.data);
      if (parsed.success) points.push(parsed.data);
    }
    return points;
  } catch (error) {
    logger.warn("Could not load proof points", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Every term a job could match this point on. */
function matchTerms(point: ProofPointEntry): string[] {
  return [
    ...point.keywords,
    ...point.skills.flatMap((s) => [s.label, ...s.keywords]),
  ];
}

/** How many distinct terms of the point appear in the job text. */
export function proofPointMatchScore(
  point: ProofPointEntry,
  jobText: string,
): number {
  const seen = new Set<string>();
  let score = 0;
  for (const term of matchTerms(point)) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (matchSkill(jobText, [{ term: key }])) score += 1;
  }
  return score;
}

/**
 * A point needs at least this many of its terms in the job. One generic word
 * ("compliance", "stakeholder") matches most postings; two is a real overlap.
 */
export const MIN_PROOF_POINT_MATCH = 2;

/**
 * The saved points that best fit a job, strongest match first. Points below
 * MIN_PROOF_POINT_MATCH are left out: they would only add noise to the prompt.
 */
export function selectProofPointsForJob(
  points: ProofPointEntry[],
  job: { title?: string | null; jobDescription?: string | null },
  limit = 8,
): ProofPointEntry[] {
  const jobText = [job.title ?? "", stripHtmlTags(job.jobDescription ?? "")]
    .join("\n")
    .trim();
  if (!jobText || points.length === 0) return [];
  return points
    .map((point, index) => ({
      point,
      index,
      score: proofPointMatchScore(point, jobText),
    }))
    .filter((m) => m.score >= MIN_PROOF_POINT_MATCH)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.point);
}

/** One line per point, for prompts. Follow-up questions are never sent. */
export function formatProofPointForPrompt(point: ProofPointEntry): string {
  const where = point.role ? ` (${point.role})` : "";
  const metric = point.metric ? ` [${point.metric}]` : "";
  return `${point.title}${where}: ${point.text}${metric}`;
}

export async function proofPointsForJob(
  job: { title?: string | null; jobDescription?: string | null },
  limit = 8,
): Promise<string[]> {
  const points = await loadProofPoints();
  return selectProofPointsForJob(points, job, limit).map(
    formatProofPointForPrompt,
  );
}

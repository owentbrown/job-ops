/**
 * AI selection of experience bullets for a tailored resume.
 *
 * The base resume keeps every bullet; this picks, per experience item, which
 * bullets the job's tailored PDF should keep. Recent roles keep 3-4, mid-career
 * roles 2 and the oldest roles 0-1, so the personal LaTeX layout collapses them
 * into "Earlier Experience".
 *
 * LLM payload: only the job description and, per experience item, its id,
 * company, position, period and bullet text. No contact details or other
 * profile fields are sent.
 */

import { logger } from "@infra/logger";
import type {
  ExperienceBulletCatalogItem,
  ExperienceBulletSelection,
} from "@shared/resume-experience-bullets";
import { stripHtmlTags } from "@shared/utils/string";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

export type ExperienceBulletTier = "recent" | "mid" | "oldest";

const TIER_LIMITS: Record<ExperienceBulletTier, { min: number; max: number }> =
  {
    recent: { min: 3, max: 4 },
    mid: { min: 2, max: 2 },
    oldest: { min: 0, max: 1 },
  };

const MAX_BULLET_CHARS = 400;
const MAX_JOB_DESCRIPTION_CHARS = 12000;

const EXPERIENCE_BULLET_SELECTION_SCHEMA: JsonSchemaDefinition = {
  name: "experience_bullet_selection",
  schema: {
    type: "object",
    properties: {
      experience: {
        type: "array",
        description: "One entry per experience item",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Experience item id" },
            keep: {
              type: "array",
              items: { type: "integer" },
              description:
                "0-based indices of bullets to keep, most relevant first",
            },
          },
          required: ["id", "keep"],
          additionalProperties: false,
        },
      },
    },
    required: ["experience"],
    additionalProperties: false,
  },
};

/**
 * Tier of the role at `position` (0 = first listed, assumed most recent) among
 * `count` roles: the first two are recent, roughly the last 40% are oldest.
 */
export function getExperienceBulletTier(
  position: number,
  count: number,
): ExperienceBulletTier {
  if (position < 2) return "recent";
  const oldestStart = Math.max(2, Math.ceil(count * 0.6));
  return position >= oldestStart ? "oldest" : "mid";
}

/** Default kept-bullet limits for a role, capped by how many it has. */
export function getExperienceBulletLimits(
  position: number,
  count: number,
  bulletCount: number,
): { tier: ExperienceBulletTier; min: number; max: number } {
  const tier = getExperienceBulletTier(position, count);
  const limits = TIER_LIMITS[tier];
  return {
    tier,
    min: Math.min(limits.min, bulletCount),
    max: Math.min(limits.max, bulletCount),
  };
}

/**
 * Validates the model's picks against the catalog: unknown ids and invalid
 * indices are dropped, each item is capped at its tier maximum, and items the
 * model skipped get their first bullets up to the tier maximum.
 */
export function normalizeExperienceBulletPicks(
  picks: unknown,
  catalog: readonly ExperienceBulletCatalogItem[],
): ExperienceBulletSelection {
  const withBullets = catalog.filter((item) => item.bullets.length > 0);
  const picksById = new Map<string, unknown[]>();
  if (Array.isArray(picks)) {
    for (const pick of picks) {
      if (!pick || typeof pick !== "object") continue;
      const { id, keep } = pick as { id?: unknown; keep?: unknown };
      if (typeof id !== "string" || !Array.isArray(keep)) continue;
      if (!picksById.has(id.trim())) picksById.set(id.trim(), keep);
    }
  }

  const selection: ExperienceBulletSelection = {};
  withBullets.forEach((item, position) => {
    const { max } = getExperienceBulletLimits(
      position,
      withBullets.length,
      item.bullets.length,
    );
    const raw = picksById.get(item.id);
    const chosen: number[] = [];
    if (raw) {
      for (const index of raw) {
        if (
          typeof index !== "number" ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= item.bullets.length ||
          chosen.includes(index)
        ) {
          continue;
        }
        if (chosen.length >= max) break;
        chosen.push(index);
      }
    } else {
      for (let index = 0; index < max; index += 1) chosen.push(index);
    }
    selection[item.id] = chosen.sort((a, b) => a - b);
  });
  return selection;
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1).trimEnd()}…`;
}

export function buildExperienceBulletSelectionPrompt(args: {
  jobDescription: string;
  catalog: readonly ExperienceBulletCatalogItem[];
}): string {
  const withBullets = args.catalog.filter((item) => item.bullets.length > 0);
  const roles = withBullets.map((item, position) => {
    const limits = getExperienceBulletLimits(
      position,
      withBullets.length,
      item.bullets.length,
    );
    return {
      id: item.id,
      company: item.company,
      position: item.position,
      period: item.period,
      keep:
        limits.min === limits.max
          ? String(limits.max)
          : `${limits.min}-${limits.max}`,
      bullets: item.bullets.map((text, index) => ({
        index,
        text: truncate(text, MAX_BULLET_CHARS),
      })),
    };
  });

  return `
You are trimming the experience section of a resume for one specific job so it fits on fewer pages.

Rules:
- For every role, choose which existing bullets to keep, by index.
- Keep about the number of bullets given in that role's "keep" field. Roles are listed most recent first: recent roles keep 3-4, mid-career roles 2, the oldest roles 0-1.
- Prefer bullets that match the job description's responsibilities, tools and domain, and bullets that show measurable impact.
- List the kept indices most relevant first. Only use indices from that role's list.
- Do NOT rewrite, merge or invent bullets.
- Return one entry for every role id below.

Job description:
${truncate(args.jobDescription, MAX_JOB_DESCRIPTION_CHARS)}

Roles:
${JSON.stringify(roles)}

Respond with JSON only, in this exact shape:
{
  "experience": [{ "id": "role-id", "keep": [0, 2] }]
}
`.trim();
}

/**
 * Picks the bullets to keep per experience item. Returns null when there is
 * nothing to trim or the model call fails, which keeps every bullet.
 */
export async function pickExperienceBulletsForJob(args: {
  jobDescription: string;
  catalog: readonly ExperienceBulletCatalogItem[];
  jobId?: string;
}): Promise<ExperienceBulletSelection | null> {
  if (!args.catalog.some((item) => item.bullets.length > 0)) return null;

  const jobDescription = stripHtmlTags(args.jobDescription);
  try {
    const [model, llm] = await Promise.all([
      resolveLlmModel("tailoring"),
      createConfiguredLlmService("tailoring"),
    ]);
    const result = await llm.callJson<{
      experience: Array<{ id: string; keep: number[] }>;
    }>({
      feature: "tailoring",
      model,
      messages: [
        {
          role: "user",
          content: buildExperienceBulletSelectionPrompt({
            jobDescription,
            catalog: args.catalog,
          }),
        },
      ],
      jsonSchema: EXPERIENCE_BULLET_SELECTION_SCHEMA,
      jobId: args.jobId,
    });
    if (!result.success || !Array.isArray(result.data?.experience)) {
      logger.warn("Experience bullet selection failed; keeping all bullets", {
        jobId: args.jobId,
        error: result.success ? "invalid response shape" : result.error,
      });
      return null;
    }
    return normalizeExperienceBulletPicks(result.data.experience, args.catalog);
  } catch (error) {
    logger.warn("Experience bullet selection failed; keeping all bullets", {
      jobId: args.jobId,
      error,
    });
    return null;
  }
}

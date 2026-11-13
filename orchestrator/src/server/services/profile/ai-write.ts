/**
 * AI writing for Profile › About you. Runs only when the user clicks "Write
 * with AI" in an edit panel: sends the resume, target roles, top skills and
 * roles, saved stories and values, plus the user's own notes and the panel's
 * current draft, to the configured "tailoring" model. Returns a draft for one
 * target (pitch, story, values or brand line). Nothing is saved here; the
 * panel fills its fields and the user saves as usual.
 *
 * Usage is recorded by LlmService itself (llm/usage.ts) under the
 * "profile_writing" feature, so it shows in Spend.
 */
import { upstreamError } from "@infra/errors";
import { logger } from "@infra/logger";
import {
  PROFILE_THEMES,
  type ProfileAiDraftByTarget,
  type ProfileAiWriteRequest,
  type ProfileAiWriteTarget,
  type ProfileBrandDraft,
  type ProfileInsightsResponse,
  type ProfilePitchDraft,
  type ProfileStoryDraft,
  type ProfileValuesDraft,
  type Theme,
} from "@shared/types";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import {
  computeProfileInsights,
  htmlToText,
  type ProfileInsightsInput,
  splitBullets,
} from "./compute";
import { loadProfileInsightsInput } from "./load";

const MAX_SUMMARY = 2000;
const MAX_ROLES = 10;
const MAX_BULLETS = 8;
const MAX_BULLET = 400;
const MAX_PROJECTS = 6;
const MAX_PROJECT = 500;
const MAX_STORIES = 20;
const MAX_FOLLOW_UPS = 5;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PITCH_SCHEMA: JsonSchemaDefinition = {
  name: "profile_pitch",
  schema: {
    type: "object",
    properties: {
      s15: { type: "string", description: "15-second pitch, about 40 words" },
      s30: { type: "string", description: "30-second pitch, about 75 words" },
      s60: { type: "string", description: "60-second pitch, about 150 words" },
    },
    required: ["s15", "s30", "s60"],
    additionalProperties: false,
  },
};

const STORY_SCHEMA: JsonSchemaDefinition = {
  name: "profile_story",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short story title" },
      themes: {
        type: "array",
        items: { type: "string", enum: [...PROFILE_THEMES] },
        description: "1 to 3 themes the story shows",
      },
      situation: { type: "string" },
      task: { type: "string" },
      action: { type: "string" },
      result: { type: "string" },
      metric: {
        type: "string",
        description:
          "The headline number from the result, e.g. '+18% activation'. Empty string when there is no real number.",
      },
      followUps: {
        type: "array",
        items: { type: "string" },
        description:
          "Up to 5 short questions to the user that would fill gaps, e.g. a missing number",
      },
    },
    required: [
      "title",
      "themes",
      "situation",
      "task",
      "action",
      "result",
      "metric",
      "followUps",
    ],
    additionalProperties: false,
  },
};

const VALUES_SCHEMA: JsonSchemaDefinition = {
  name: "profile_values",
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "3 to 8 work values, most important first",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "1 to 4 words" },
            starred: {
              type: "boolean",
              description: "true for the top 1 to 3 non-negotiables",
            },
          },
          required: ["label", "starred"],
          additionalProperties: false,
        },
      },
      ideal: {
        type: "object",
        properties: {
          size: {
            type: "integer",
            description: "0 startup .. 100 enterprise",
          },
          management: {
            type: "integer",
            description: "0 hands-on .. 100 managing people",
          },
          office: { type: "integer", description: "0 remote .. 100 in office" },
        },
        required: ["size", "management", "office"],
        additionalProperties: false,
      },
    },
    required: ["items", "ideal"],
    additionalProperties: false,
  },
};

const BRAND_SCHEMA: JsonSchemaDefinition = {
  name: "profile_brand",
  schema: {
    type: "object",
    properties: {
      line: {
        type: "string",
        description: "One-line personal brand, under 20 words",
      },
    },
    required: ["line"],
    additionalProperties: false,
  },
};

const SCHEMAS: Record<ProfileAiWriteTarget, JsonSchemaDefinition> = {
  pitch: PITCH_SCHEMA,
  story: STORY_SCHEMA,
  values: VALUES_SCHEMA,
  brand: BRAND_SCHEMA,
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const NO_INVENTION_RULE =
  "Use only facts that appear in the profile or the user's notes below. Never invent employers, job titles, dates, numbers, metrics or achievements.";
export const PLACEHOLDER_RULE =
  "If a number or detail is missing, write a [placeholder] in square brackets (e.g. [X%]) instead of guessing.";

const TASKS: Record<ProfileAiWriteTarget, string[]> = {
  pitch: [
    "Write the user's elevator pitch in three lengths, in the first person.",
    "s15 is about 40 words: who they are and the one thing they are best at.",
    "s30 is about 75 words: add one concrete proof point and what they want next.",
    "s60 is about 150 words: add a short story or second proof point and the kind of role they are looking for.",
    "Lead with the strongest proof (results with numbers, saved stories). Aim it at the target roles.",
  ],
  story: [
    "Write one interview story in STAR form (situation, task, action, result), in the first person.",
    "Build it from the user's notes; when the notes are thin, pick the strongest matching resume bullet.",
    "Keep each part to 1 to 3 sentences. The result should say what changed and by how much.",
    `Pick 1 to 3 themes from: ${PROFILE_THEMES.join(", ")}.`,
    "metric is the single headline number from the result, or an empty string when there is no real number.",
    "followUps are short questions to the user that would fill gaps (a missing number, team size, timeframe). Ask about every [placeholder]. Return an empty list when nothing is missing.",
  ],
  values: [
    "Suggest the user's work values: 3 to 8 short labels (1 to 4 words each), most important first. Star the top 1 to 3 non-negotiables.",
    "Also suggest ideal-role sliders, each 0 to 100: size (0 startup, 100 enterprise), management (0 hands-on, 100 managing people), office (0 remote, 100 in office).",
    "Base them on the notes first, then on patterns in the resume and target roles. When there is no signal for a slider, use 50 or keep the current value.",
  ],
  brand: [
    "Write the user's one-line personal brand: under 20 words, saying who they are, what they are known for and for whom.",
    "No buzzword lists, no first-person 'I am'. Example shape: 'Product manager who turns messy B2B workflows into products teams adopt.'",
  ],
};

type Loose = Record<string, unknown>;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Plain-text profile context. Missing parts are left out. */
export function buildProfileContext(
  input: ProfileInsightsInput,
  insights: ProfileInsightsResponse,
): string {
  const parts: string[] = [];
  const resume = input.resume;
  if (resume) {
    const lines: string[] = ["## Resume"];
    if (resume.basics.headline.trim()) {
      lines.push(`Headline: ${resume.basics.headline.trim()}`);
    }
    const summary = htmlToText(resume.summary);
    if (summary) lines.push(`Summary: ${clip(summary, MAX_SUMMARY)}`);
    const roles = resume.experience.slice(0, MAX_ROLES);
    if (roles.length > 0) {
      lines.push("", "### Experience");
      for (const role of roles) {
        const head = [role.position, role.company && `at ${role.company}`]
          .filter(Boolean)
          .join(" ");
        lines.push(`- ${head}${role.period ? ` (${role.period})` : ""}`);
        for (const bullet of splitBullets(role.description).slice(
          0,
          MAX_BULLETS,
        )) {
          lines.push(`  - ${clip(bullet, MAX_BULLET)}`);
        }
      }
    }
    const projects = resume.projects.slice(0, MAX_PROJECTS);
    if (projects.length > 0) {
      lines.push("", "### Projects");
      for (const p of projects) {
        const text = htmlToText(p.description);
        lines.push(`- ${p.name}${text ? `: ${clip(text, MAX_PROJECT)}` : ""}`);
      }
    }
    parts.push(lines.join("\n"));
  }

  if (input.searchTerms.length > 0) {
    parts.push(`## Target roles\n${input.searchTerms.join(", ")}`);
  }

  const topSkills = insights.skills
    .filter((s) => s.demandCount > 0)
    .sort((a, b) => b.demandPct - a.demandPct)
    .slice(0, 10)
    .map((s) => `${s.label} (asked for in ${s.demandPct}% of best-fit jobs)`);
  if (topSkills.length > 0) {
    parts.push(
      `## Skills the target jobs ask for most\n${topSkills.join("\n")}`,
    );
  }

  if (insights.roles.length > 0) {
    parts.push(
      `## Best-fit role families\n${insights.roles
        .map((r) => `${r.label} (${r.tag}, average fit ${r.fit})`)
        .join("\n")}`,
    );
  }

  const stories = input.entries.stories.slice(0, MAX_STORIES);
  if (stories.length > 0) {
    parts.push(
      `## Saved stories\n${stories
        .map((s) => {
          const result = s.data.result.trim();
          return `- ${s.data.title}${result ? `: ${clip(result, 300)}` : ""}`;
        })
        .join("\n")}`,
    );
  }

  const values = input.entries.values;
  if (values && values.items.length > 0) {
    parts.push(
      `## Saved values\n${values.items
        .map((v) => `${v.label}${v.starred ? " (non-negotiable)" : ""}`)
        .join(", ")}`,
    );
  }

  const brand = input.entries.brand?.line.trim();
  if (brand) parts.push(`## Saved brand line\n${brand}`);

  return parts.length > 0
    ? parts.join("\n\n")
    : "(The profile is empty. Rely on the user's notes.)";
}

export function buildWritePrompt(
  request: ProfileAiWriteRequest,
  context: string,
): string {
  const notes = request.notes?.trim();
  const current = request.current;
  const hasCurrent =
    current !== undefined &&
    Object.values(current as Loose).some((v) =>
      Array.isArray(v)
        ? v.length > 0
        : typeof v === "string"
          ? !!v.trim()
          : v != null,
    );
  return [
    "You help a job seeker write their professional profile.",
    ...TASKS[request.target],
    "",
    "## Rules",
    `- ${NO_INVENTION_RULE}`,
    `- ${PLACEHOLDER_RULE}`,
    "- Write in a plain, confident voice: short sentences, active verbs, no hype, no clichés ('passionate', 'results-driven', 'synergy').",
    "- The user's notes take priority over the resume when they differ.",
    hasCurrent
      ? "- A current draft is included. Improve it: keep its facts and the user's wording where it works."
      : "",
    "",
    "## User's notes",
    notes || "(none)",
    "",
    ...(hasCurrent ? ["## Current draft", JSON.stringify(current), ""] : []),
    "# Profile",
    context,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slider(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : NaN;
  return Number.isNaN(n) ? fallback : Math.min(100, Math.max(0, Math.round(n)));
}

function sanitizePitch(raw: Loose): ProfilePitchDraft | null {
  const draft = {
    s15: text(raw.s15, 1500),
    s30: text(raw.s30, 3000),
    s60: text(raw.s60, 6000),
  };
  return draft.s15 || draft.s30 || draft.s60 ? draft : null;
}

function sanitizeStory(raw: Loose): ProfileStoryDraft | null {
  const themes = Array.isArray(raw.themes)
    ? PROFILE_THEMES.filter((t) => (raw.themes as unknown[]).includes(t))
    : [];
  const metric = text(raw.metric, 200);
  const followUps = Array.isArray(raw.followUps)
    ? raw.followUps
        .map((q) => text(q, 300))
        .filter(Boolean)
        .slice(0, MAX_FOLLOW_UPS)
    : [];
  const draft: ProfileStoryDraft = {
    title: text(raw.title, 200),
    themes: themes as Theme[],
    situation: text(raw.situation, 4000),
    task: text(raw.task, 4000),
    action: text(raw.action, 4000),
    result: text(raw.result, 4000),
    metric: metric || null,
    followUps,
  };
  if (!draft.title && !draft.situation && !draft.action && !draft.result) {
    return null;
  }
  return draft;
}

function sanitizeValues(
  raw: Loose,
  current: ProfileValuesDraft["ideal"] | undefined,
): ProfileValuesDraft | null {
  const seen = new Set<string>();
  const items: ProfileValuesDraft["items"] = [];
  for (const item of Array.isArray(raw.items) ? raw.items : []) {
    if (!item || typeof item !== "object") continue;
    const label = text((item as Loose).label, 80);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    items.push({ label, starred: (item as Loose).starred === true });
    if (items.length >= 30) break;
  }
  if (items.length === 0) return null;
  const ideal = (raw.ideal ?? {}) as Loose;
  return {
    items,
    ideal: {
      size: slider(ideal.size, current?.size ?? 50),
      management: slider(ideal.management, current?.management ?? 50),
      office: slider(ideal.office, current?.office ?? 50),
    },
  };
}

function sanitizeBrand(raw: Loose): ProfileBrandDraft | null {
  const line = text(raw.line, 400);
  return line ? { line } : null;
}

export type ProfileAiDraft = ProfileAiDraftByTarget[ProfileAiWriteTarget];

export function sanitizeDraft(
  request: ProfileAiWriteRequest,
  raw: unknown,
): ProfileAiDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Loose;
  switch (request.target) {
    case "pitch":
      return sanitizePitch(data);
    case "story":
      return sanitizeStory(data);
    case "values":
      return sanitizeValues(data, request.current?.ideal);
    case "brand":
      return sanitizeBrand(data);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function writeProfileDraft(
  request: ProfileAiWriteRequest,
): Promise<ProfileAiDraft> {
  const input = await loadProfileInsightsInput();
  const insights = computeProfileInsights(input);
  const prompt = buildWritePrompt(
    request,
    buildProfileContext(input, insights),
  );

  const [model, llm] = await Promise.all([
    resolveLlmModel("tailoring"),
    createConfiguredLlmService("tailoring"),
  ]);
  const result = await llm.callJson<unknown>({
    feature: "profile_writing",
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: SCHEMAS[request.target],
    maxRetries: 1,
    retryDelayMs: 300,
  });

  if (!result.success) {
    logger.warn("Profile AI writing failed", {
      target: request.target,
      error: result.error,
    });
    throw upstreamError("AI writing failed", { reason: result.error });
  }
  const draft = sanitizeDraft(request, result.data);
  if (!draft) {
    throw upstreamError("AI writing returned an empty draft");
  }
  return draft;
}

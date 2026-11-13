/**
 * Pure calculations for Profile › About you. Inputs are slim, already-scoped
 * rows (see load.ts); nothing here touches the database or an LLM.
 */

import {
  parseSavedKeyword,
  STARTER_SKILL_GROUPS,
  type StarterSkillKeyword,
} from "@shared/profile/starter-skills";
import {
  type ApplicationStage,
  type BrandEntry,
  type JobStatus,
  type PitchEntry,
  PROFILE_THEMES,
  type ProfileActionId,
  type ProfileDataState,
  type ProfileEntryRow,
  type ProfileInsightsResponse,
  type ProfileLandingInsight,
  type ProfileRoleInsight,
  type ProfileSkillInsight,
  type ProfileStoriesInsight,
  type ProfileStrengthCheck,
  type RoleTag,
  type SkillProofLevel,
  type SkillQuadrant,
  type SkillSource,
  type SkillsEntry,
  type StoryEntry,
  type Theme,
  type ValuesEntry,
} from "@shared/types";
import { normalizeWhitespace, stripHtmlTags } from "@shared/utils/string";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ProfileResumeInput = {
  basics: {
    name: string;
    headline: string;
    location: string;
    email: string;
    profiles: { network: string; url: string }[];
  };
  /** HTML. */
  summary: string;
  experience: {
    position: string;
    company: string;
    period: string;
    /** HTML; bullets are its <li> elements. */
    description: string;
  }[];
  projects: { name: string; description: string }[];
  /** Skill names from the resume's skills ("Core strengths") section. */
  skills: string[];
};

export type ProfileJobRow = {
  id: string;
  title: string;
  employer: string;
  status: JobStatus;
  suitabilityScore: number | null;
  description: string | null;
  appliedAt: string | null;
  /** Current application stage, null when never applied. */
  stage: ApplicationStage | null;
};

export type ProfileEntriesInput = {
  brand: BrandEntry | null;
  pitch: PitchEntry | null;
  values: ValuesEntry | null;
  skills: SkillsEntry | null;
  stories: ProfileEntryRow<StoryEntry>[];
  /** Latest updatedAt across the singleton rows, null when none exist. */
  singletonsUpdatedAt: string | null;
};

export type ProfileInsightsInput = {
  resume: ProfileResumeInput | null;
  resumeUpdatedAt: string | null;
  searchTerms: string[];
  jobs: ProfileJobRow[];
  entries: ProfileEntriesInput;
  now: Date;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** Below this many scored jobs the skill map and roles are "too early". */
const MIN_SCORED_JOBS = 5;
const BEST_FIT_SCORE = 50;
const BEST_FIT_MIN_DESCRIPTION = 300;
const BEST_FIT_MIN_JOBS = 10;
const HIGH_DEMAND_PCT = 50;
const STRONG_PROOF = 2;
const PROOF_CHECK_DEMAND_PCT = 40;
const STRONG_JOB_SCORE = 65;
/** Family size at which "many jobs" (Step up) applies; fewer is "few" (Adjacent). */
const MANY_JOBS = 5;
const LOW_FIT_FAMILY_AVG = 45;
const MAX_ROLES = 4;
const TOP_SKILLS_PER_ROLE = 3;
const APPLIED_STATUSES = new Set<JobStatus>(["applied", "in_progress"]);
const OPEN_STATUSES = new Set<JobStatus>(["discovered", "ready"]);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      // fromCodePoint throws a RangeError past U+10FFFF; leave those as text.
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** HTML to plain text: tags become spaces, entities are decoded. */
export function htmlToText(html: string): string {
  return normalizeWhitespace(decodeEntities(stripHtmlTags(html ?? "")));
}

/**
 * Bullets of an HTML description: the text of each <li>. Without list items,
 * each paragraph / line counts as one bullet, so plain-text descriptions still
 * score.
 */
export function splitBullets(html: string): string[] {
  if (!html) return [];
  const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
    htmlToText(m[1]),
  );
  if (items.length > 0) return items.filter(Boolean);
  return html
    .split(/<\/p>|<br\s*\/?>|\n/i)
    .map(htmlToText)
    .filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const regexCache = new Map<string, RegExp>();

function keywordRegex(keyword: StarterSkillKeyword): RegExp {
  const key = `${keyword.prefix ? "p" : "w"}:${keyword.term.toLowerCase()}`;
  let re = regexCache.get(key);
  if (!re) {
    // Whole-word terms also match a simple plural ("stakeholders").
    const end = keyword.prefix ? "" : "(?:e?s)?(?![\\p{L}\\p{N}])";
    re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(keyword.term.trim())}${end}`,
      "iu",
    );
    regexCache.set(key, re);
  }
  return re;
}

/**
 * True when `text` mentions any keyword: case-insensitive and whole-word
 * (letters and digits on either side break a match, so "rapid" never matches
 * "API"). A simple plural (-s / -es) still counts as the whole word, so
 * "stakeholder" matches "stakeholders". A prefix keyword drops the end
 * boundary. Saved keywords mark a prefix with a trailing "*" ("prioriti*");
 * skillDefs parses that into `prefix: true`.
 */
export function matchSkill(
  text: string,
  keywords: StarterSkillKeyword[],
): boolean {
  if (!text) return false;
  return keywords.some((k) => k.term.trim() && keywordRegex(k).test(text));
}

/** A bullet "has a number" when it has a digit that is not just a year. */
export function bulletHasNumber(bullet: string): boolean {
  return /\d/.test(bullet.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ""));
}

function round(n: number): number {
  return Math.round(n);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

type SkillDef = {
  id: string;
  label: string;
  keywords: StarterSkillKeyword[];
  source: SkillSource;
};

function skillDefs(skills: SkillsEntry | null): SkillDef[] {
  if (!skills) {
    return STARTER_SKILL_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      keywords: g.keywords,
      source: "starter" as const,
    }));
  }
  return skills.items
    .filter((item) => !item.hidden)
    .map((item) => ({
      id: item.id,
      label: item.label,
      keywords: item.keywords.map(parseSavedKeyword),
      source: item.source,
    }));
}

type ProofSources = {
  stories: string[];
  bullets: string[];
  core: string;
};

function proofSources(
  resume: ProfileResumeInput | null,
  stories: ProfileEntryRow<StoryEntry>[],
): ProofSources {
  const storyTexts = stories.map((row) => {
    const s = row.data;
    return [s.title, s.situation, s.task, s.action, s.result, s.metric ?? ""]
      .join(" \n ")
      .trim();
  });
  if (!resume) return { stories: storyTexts, bullets: [], core: "" };
  const bullets = [
    ...resume.experience.flatMap((e) => splitBullets(e.description)),
    ...resume.projects.flatMap((p) => splitBullets(p.description)),
  ];
  const core = [...resume.skills, htmlToText(resume.summary)].join(" \n ");
  return { stories: storyTexts, bullets, core };
}

export function proofLevel(
  keywords: StarterSkillKeyword[],
  sources: ProofSources,
): SkillProofLevel {
  if (sources.stories.some((t) => matchSkill(t, keywords))) return 3;
  const mentioning = sources.bullets.filter((b) => matchSkill(b, keywords));
  if (mentioning.some(bulletHasNumber)) return 2;
  if (mentioning.length > 0) return 1;
  if (matchSkill(sources.core, keywords)) return 0.5;
  return 0;
}

export function quadrantFor(
  demandPct: number,
  proof: SkillProofLevel,
): SkillQuadrant {
  const highDemand = demandPct >= HIGH_DEMAND_PCT;
  const strong = proof >= STRONG_PROOF;
  if (highDemand) return strong ? "lead-with" : "prove";
  return strong ? "hidden" : "nice-to-have";
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

function isApplied(job: ProfileJobRow): boolean {
  return (
    job.appliedAt !== null ||
    job.stage !== null ||
    APPLIED_STATUSES.has(job.status)
  );
}

function isScored(job: ProfileJobRow): job is ProfileJobRow & {
  suitabilityScore: number;
} {
  return typeof job.suitabilityScore === "number";
}

/**
 * Applied or scoring 50+, with a description over 300 characters. With fewer
 * than 10 of those, every scored job with a description is added.
 */
export function bestFitJobs(jobs: ProfileJobRow[]): ProfileJobRow[] {
  const primary = jobs.filter(
    (job) =>
      (isApplied(job) ||
        (isScored(job) && job.suitabilityScore >= BEST_FIT_SCORE)) &&
      (job.description ?? "").length > BEST_FIT_MIN_DESCRIPTION,
  );
  if (primary.length >= BEST_FIT_MIN_JOBS) return primary;
  const ids = new Set(primary.map((j) => j.id));
  const extra = jobs.filter(
    (job) =>
      !ids.has(job.id) && isScored(job) && (job.description ?? "").trim(),
  );
  return [...primary, ...extra];
}

type RoleFamily = { id: string; label: string; pattern: RegExp | null };

/** Checked in order; the first match wins. */
export const ROLE_FAMILIES: RoleFamily[] = [
  {
    id: "product-ops",
    label: "Product Operations",
    pattern: /\bproduct op(eration)?s\b/i,
  },
  {
    id: "program-project",
    label: "Program / Project",
    pattern:
      /\b(program(me)?|project|delivery) (manag|lead|director|coordinat)|\b(pmo|tpm)\b/i,
  },
  {
    id: "product-manager",
    label: "Product Manager / Owner",
    pattern:
      /\bproduct (manag|owner|lead|director)|\b(head|director|vp|vice president) of product\b|\bpm\b/i,
  },
  {
    id: "strategy-ops",
    label: "Strategy & Operations",
    pattern:
      /\bstrateg|\bbiz ?ops\b|\bbusiness operations\b|\bchief of staff\b|\btransformation\b/i,
  },
  {
    id: "customer-success",
    label: "Customer Success / CX",
    pattern:
      /\b(customer|client) (success|experience)\b|\bcx\b|\baccount manag|\bcustomer\b/i,
  },
  {
    id: "growth-gtm",
    label: "Growth / GTM",
    pattern:
      /\bgrowth\b|\bgo[- ]to[- ]market\b|\bgtm\b|\bmarketing\b|\brev ?ops\b|\brevenue\b|\bpartnerships?\b|\bbusiness development\b/i,
  },
  {
    id: "analytics",
    label: "Analytics",
    pattern:
      /\banalyst\b|\banalytics\b|\bdata\b|\binsights?\b|\bbusiness intelligence\b|\bbi\b/i,
  },
  {
    // Generic operations titles, after the more specific families above.
    id: "strategy-ops",
    label: "Strategy & Operations",
    pattern: /\boperations?\b|\bops\b/i,
  },
  { id: "other", label: "Other", pattern: null },
];

export function roleFamilyFor(title: string): { id: string; label: string } {
  const family =
    ROLE_FAMILIES.find((f) => f.pattern?.test(title)) ?? ROLE_FAMILIES.at(-1);
  return { id: (family as RoleFamily).id, label: (family as RoleFamily).label };
}

export function roleTag(
  avg: number,
  jobCount: number,
  strongCount: number,
): RoleTag {
  if (avg >= 65 && strongCount >= 3) return "Core fit";
  if (avg >= 55 && jobCount >= MANY_JOBS) return "Step up";
  if (avg >= 60 && jobCount < MANY_JOBS) return "Adjacent";
  return "Stretch";
}

const TAG_RANK: Record<RoleTag, number> = {
  "Core fit": 0,
  "Step up": 1,
  Adjacent: 2,
  Stretch: 3,
};

type FamilyStats = {
  id: string;
  label: string;
  /** Scored jobs. */
  scored: ProfileJobRow[];
  all: ProfileJobRow[];
  avg: number;
};

function groupFamilies(jobs: ProfileJobRow[]): Map<string, FamilyStats> {
  const map = new Map<string, FamilyStats>();
  for (const job of jobs) {
    const fam = roleFamilyFor(job.title);
    let stats = map.get(fam.id);
    if (!stats) {
      stats = { id: fam.id, label: fam.label, scored: [], all: [], avg: 0 };
      map.set(fam.id, stats);
    }
    stats.all.push(job);
    if (isScored(job)) stats.scored.push(job);
  }
  for (const stats of map.values()) {
    stats.avg =
      average(stats.scored.map((j) => j.suitabilityScore as number)) ?? 0;
  }
  return map;
}

function roleText(
  top: { label: string; proof: SkillProofLevel }[],
  avg: number,
  jobCount: number,
): { why: string; gap: string } {
  const strong = top.filter((s) => s.proof >= STRONG_PROOF).map((s) => s.label);
  const weak = top.filter((s) => s.proof < STRONG_PROOF).map((s) => s.label);
  const jobs = `${jobCount} scored job${jobCount === 1 ? "" : "s"}`;
  const why =
    strong.length > 0
      ? `They ask for ${joinList(strong)}, which you already back with results.`
      : `Average fit of ${round(avg)} across ${jobs}.`;
  const gap =
    weak.length > 0
      ? `Add proof of ${joinList(weak)}: a bullet with a number or a story.`
      : top.length > 0
        ? "No clear gap in the skills these roles ask for most."
        : "Not enough job detail yet to spot a gap.";
  return { why, gap };
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

/** Words too generic to show a headline is aimed at a target role. */
const GENERIC_ROLE_WORDS = new Set([
  "senior",
  "junior",
  "manager",
  "lead",
  "head",
  "director",
  "principal",
  "associate",
  "staff",
  "chief",
  "officer",
  "and",
]);

function lineAimedAtTarget(line: string, searchTerms: string[]): boolean {
  if (!line.trim()) return false;
  const terms = searchTerms.map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) return true;
  const lineWords = new Set(line.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return terms.some((term) => {
    if (matchSkill(line, [{ term }])) return true;
    const words = term.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    return words.some(
      (w) => w.length >= 4 && !GENERIC_ROLE_WORDS.has(w) && lineWords.has(w),
    );
  });
}

function check(
  base: Omit<ProfileStrengthCheck, "fix" | "action">,
  fix: string,
  action?: ProfileActionId,
): ProfileStrengthCheck {
  const points = Math.max(0, Math.min(base.max, round(base.points)));
  if (points >= base.max) return { ...base, points };
  return action ? { ...base, points, fix, action } : { ...base, points, fix };
}

function basicsCheck(
  resume: ProfileResumeInput | null,
  brandLine: string | null,
  searchTerms: string[],
): ProfileStrengthCheck {
  const b = resume?.basics;
  const hasLinkedIn = (b?.profiles ?? []).some(
    (p) => /linkedin/i.test(p.network) || /linkedin\.com/i.test(p.url),
  );
  const parts: [string, boolean][] = [
    ["name", Boolean(b?.name.trim())],
    ["location", Boolean(b?.location.trim())],
    ["email", Boolean(b?.email.trim())],
    ["LinkedIn", hasLinkedIn],
  ];
  const aimed = lineAimedAtTarget(brandLine ?? "", searchTerms);
  const missing = parts.filter(([, ok]) => !ok).map(([name]) => name);
  const points = (parts.length - missing.length) * 2 + (aimed ? 2 : 0);
  const fix =
    missing.length > 0
      ? `Add your ${joinList(missing)} to your resume.`
      : "Write a brand line that names the role you're targeting.";
  return check(
    {
      id: "basics",
      label: "Basics",
      points,
      max: 10,
      how: "Name, location, email, LinkedIn and a brand line aimed at a target role: 2 points each.",
    },
    fix,
    missing.length > 0 ? "edit-resume" : "edit-brand",
  );
}

function resultsCheck(resume: ProfileResumeInput | null): ProfileStrengthCheck {
  const roles = resume?.experience ?? [];
  const perRole = roles.map((role) => ({
    role,
    bullets: splitBullets(role.description),
  }));
  const bullets = perRole.flatMap((r) => r.bullets);
  const withNumber = bullets.filter(bulletHasNumber).length;
  const share = bullets.length ? withNumber / bullets.length : 0;
  const empty = perRole
    .filter((r) => r.bullets.length === 0)
    .map((r) =>
      [r.role.position, r.role.company].filter((s) => s.trim()).join(" at "),
    )
    .filter(Boolean);
  let fix: string;
  if (roles.length === 0) fix = "Add your experience to your resume.";
  else if (bullets.length === 0) fix = "Add bullets to your roles.";
  else
    fix = `${withNumber} of ${bullets.length} bullets show a number. Add results to the rest.`;
  if (empty.length > 0 && roles.length > 0 && bullets.length > 0) {
    fix += ` No bullets yet: ${joinList(empty)}.`;
  }
  return check(
    {
      id: "results",
      label: "Results in experience",
      points: 20 * share,
      max: 20,
      how: "20 × the share of experience bullets that contain a number.",
    },
    fix,
    "edit-resume",
  );
}

function proofCheck(
  skills: ProfileSkillInsight[],
  bestFitCount: number,
): ProfileStrengthCheck {
  const base = {
    id: "proof" as const,
    label: "Proof for in-demand skills",
    max: 25,
    how: "For skills in 40% or more of your best-fit jobs: average proof (capped at 2) ÷ 2 × 25.",
  };
  if (bestFitCount === 0) {
    return check(
      { ...base, points: 0 },
      "Run a search so we can see which skills your jobs ask for.",
    );
  }
  const demanded = skills.filter((s) => s.demandPct >= PROOF_CHECK_DEMAND_PCT);
  if (demanded.length === 0) {
    return check({ ...base, points: base.max }, "");
  }
  const mean =
    demanded.reduce((sum, s) => sum + Math.min(s.proof, STRONG_PROOF), 0) /
    demanded.length;
  const weak = demanded
    .filter((s) => s.proof < STRONG_PROOF)
    .sort((a, b) => b.demandPct - a.demandPct)
    .slice(0, 3)
    .map((s) => s.label);
  return check(
    { ...base, points: (mean / STRONG_PROOF) * base.max },
    `Add a bullet with a number for ${joinList(weak)}.`,
    "edit-resume",
  );
}

function storiesCheck(themes: Set<Theme>): ProfileStrengthCheck {
  const missing = PROFILE_THEMES.filter((t) => !themes.has(t));
  return check(
    {
      id: "stories",
      label: "Story coverage",
      points: (themes.size * 20) / PROFILE_THEMES.length,
      max: 20,
      how: "Each of the 6 themes with at least one saved story: 20 ÷ 6 points.",
    },
    `Add a story about ${joinList(missing)}.`,
    "add-story",
  );
}

function pitchValuesCheck(
  pitch: PitchEntry | null,
  values: ValuesEntry | null,
): ProfileStrengthCheck {
  const lengths = pitch ? [pitch.s15, pitch.s30, pitch.s60] : [];
  const pitchCount = lengths.filter((s) => s.trim()).length;
  const enoughValues = (values?.items.length ?? 0) >= 3;
  const hasIdeal = values !== null;
  const points = pitchCount * 2 + (enoughValues ? 2 : 0) + (hasIdeal ? 2 : 0);
  let fix: string;
  let action: ProfileActionId;
  if (pitchCount < 3) {
    const names = ["15s", "30s", "60s"].filter((_, i) => !lengths[i]?.trim());
    fix = `Write your ${joinList(names)} pitch.`;
    action = "edit-pitch";
  } else {
    fix = enoughValues
      ? "Set your ideal-role sliders."
      : "Pick at least 3 values that drive you.";
    action = "edit-values";
  }
  return check(
    {
      id: "pitch-values",
      label: "Pitch and values",
      points,
      max: 10,
      how: "Each pitch length: 2. Three or more values: 2. Ideal-role sliders saved: 2.",
    },
    fix,
    action,
  );
}

function freshCheck(latest: number | null, now: Date): ProfileStrengthCheck {
  const days =
    latest === null ? null : Math.floor((now.getTime() - latest) / DAY_MS);
  const points = days === null ? 0 : days <= 60 ? 15 : days <= 120 ? 8 : 0;
  return check(
    {
      id: "fresh",
      label: "Fresh",
      points,
      max: 15,
      how: "Resume or profile updated in the last 60 days: 15. In the last 120 days: 8.",
    },
    days === null
      ? "Review your resume and save it."
      : `Last updated ${days} days ago. Review your resume.`,
    "edit-resume",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function latestMs(dates: (string | null | undefined)[]): number | null {
  const ms = dates
    .map((d) => (d ? Date.parse(d) : Number.NaN))
    .filter(Number.isFinite);
  return ms.length ? Math.max(...ms) : null;
}

function storiesInsight(
  stories: ProfileEntryRow<StoryEntry>[],
): ProfileStoriesInsight {
  const counts = new Map<Theme, number>(PROFILE_THEMES.map((t) => [t, 0]));
  for (const row of stories) {
    for (const theme of new Set(row.data.themes)) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  const top = [...stories]
    .sort((a, b) => {
      const am = a.data.metric?.trim() ? 1 : 0;
      const bm = b.data.metric?.trim() ? 1 : 0;
      if (am !== bm) return bm - am;
      const lr = b.data.result.trim().length - a.data.result.trim().length;
      if (lr !== 0) return lr;
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    })
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      title: row.data.title,
      themes: row.data.themes,
      result: row.data.result,
      metric: row.data.metric,
    }));
  return {
    total: stories.length,
    themes: PROFILE_THEMES.map((theme) => ({
      theme,
      count: counts.get(theme) ?? 0,
    })),
    top,
  };
}

export function computeProfileInsights(
  input: ProfileInsightsInput,
): ProfileInsightsResponse {
  const { resume, entries, jobs, now } = input;
  const searchTerms = input.searchTerms.map((t) => t.trim()).filter(Boolean);
  const scoredJobs = jobs.filter(isScored);

  const dataState: ProfileDataState = !resume
    ? "no-resume"
    : scoredJobs.length < MIN_SCORED_JOBS
      ? "too-early"
      : "ok";

  // Skills ------------------------------------------------------------------
  const bestFit = bestFitJobs(jobs);
  const defs = skillDefs(entries.skills);
  const sources = proofSources(resume, entries.stories);
  const proofById = new Map<string, SkillProofLevel>();
  const skills: ProfileSkillInsight[] = defs
    .map((def) => {
      const demandCount = bestFit.filter((job) =>
        matchSkill(job.description ?? "", def.keywords),
      ).length;
      const demandPct = bestFit.length
        ? round((demandCount / bestFit.length) * 100)
        : 0;
      const proof = proofLevel(def.keywords, sources);
      proofById.set(def.id, proof);
      return {
        id: def.id,
        label: def.label,
        demandPct,
        demandCount,
        proof,
        quadrant: quadrantFor(demandPct, proof),
        source: def.source,
      };
    })
    .sort(
      (a, b) => b.demandPct - a.demandPct || a.label.localeCompare(b.label),
    );

  // Roles -------------------------------------------------------------------
  const families = groupFamilies(jobs);
  const roles: ProfileRoleInsight[] = [...families.values()]
    .filter((f) => f.id !== "other" && f.scored.length > 0)
    .map((f) => {
      const strongCount = f.scored.filter(
        (j) => (j.suitabilityScore as number) >= STRONG_JOB_SCORE,
      ).length;
      const fitScores = f.scored
        .map((j) => j.suitabilityScore as number)
        .filter((s) => s >= BEST_FIT_SCORE);
      const fit = round(average(fitScores) ?? f.avg);
      const withText = f.all.filter((j) => (j.description ?? "").trim());
      const top = defs
        .map((def) => ({
          label: def.label,
          proof: proofById.get(def.id) ?? 0,
          count: withText.filter((j) =>
            matchSkill(j.description ?? "", def.keywords),
          ).length,
        }))
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, TOP_SKILLS_PER_ROLE);
      const tag = roleTag(f.avg, f.scored.length, strongCount);
      const text = roleText(top, f.avg, f.scored.length);
      return {
        familyId: f.id,
        label: f.label,
        tag,
        fit,
        avg: f.avg,
        jobCount: f.scored.length,
        strongCount,
        appliedCount: f.all.filter(isApplied).length,
        openCount: f.scored.filter(
          (j) =>
            OPEN_STATUSES.has(j.status) &&
            !isApplied(j) &&
            (j.suitabilityScore as number) >= BEST_FIT_SCORE,
        ).length,
        why: text.why,
        gap: text.gap,
        topSkills: top.map((s) => s.label),
      };
    })
    .sort(
      (a, b) =>
        TAG_RANK[a.tag] - TAG_RANK[b.tag] ||
        b.avg - a.avg ||
        b.jobCount - a.jobCount,
    )
    .slice(0, MAX_ROLES)
    .map(({ avg: _avg, ...role }) => role);

  // Landing -----------------------------------------------------------------
  const applied = jobs.filter(isApplied);
  const appliedScored = applied.filter(isScored);
  const bestApplied = [...appliedScored].sort(
    (a, b) => (b.suitabilityScore as number) - (a.suitabilityScore as number),
  )[0];
  const lowFamilies = [...families.values()].filter(
    (f) => f.scored.length > 0 && f.avg < LOW_FIT_FAMILY_AVG,
  );
  const lowIds = new Set(lowFamilies.map((f) => f.id));
  const lowApplied = applied.filter((j) =>
    lowIds.has(roleFamilyFor(j.title).id),
  );
  const landing: ProfileLandingInsight = {
    applications: applied.length,
    averageFit: appliedScored.length
      ? round(average(appliedScored.map((j) => j.suitabilityScore)) as number)
      : null,
    best: bestApplied
      ? {
          jobId: bestApplied.id,
          title: bestApplied.title,
          employer: bestApplied.employer,
          score: bestApplied.suitabilityScore,
        }
      : null,
    lowFitSharePct: applied.length
      ? round((lowApplied.length / applied.length) * 100)
      : null,
    lowFitFamilies: lowFamilies
      .filter((f) => f.all.some(isApplied))
      .map((f) => f.label),
  };

  // Brand, pitch, values, stories -------------------------------------------
  const savedLine = entries.brand?.line.trim() ?? "";
  const headline = resume?.basics.headline.trim() ?? "";
  const brandLine = savedLine || headline || null;
  const brand = {
    initials: initialsOf(resume?.basics.name ?? ""),
    line: brandLine,
    lineSource: savedLine
      ? ("saved" as const)
      : headline
        ? ("headline" as const)
        : ("none" as const),
    targetRoles: searchTerms,
    location: resume?.basics.location.trim() || null,
    industries: entries.brand?.industries ?? [],
  };

  const storyTitles = new Map(entries.stories.map((s) => [s.id, s.data.title]));
  const pitch = entries.pitch;
  const pitchInsight = {
    s15: pitch?.s15 ?? "",
    s30: pitch?.s30 ?? "",
    s60: pitch?.s60 ?? "",
    builtFrom: {
      stories: (pitch?.builtFrom.storyIds ?? []).flatMap((id) => {
        const title = storyTitles.get(id);
        return title === undefined ? [] : [{ id, title }];
      }),
      values: pitch?.builtFrom.values ?? [],
    },
    isEmpty: !pitch || ![pitch.s15, pitch.s30, pitch.s60].some((s) => s.trim()),
  };

  const values = {
    items: entries.values?.items ?? [],
    ideal: entries.values?.ideal ?? null,
  };

  const stories = storiesInsight(entries.stories);

  // Strength ----------------------------------------------------------------
  const coveredThemes = new Set(
    stories.themes.filter((t) => t.count > 0).map((t) => t.theme),
  );
  const checks = [
    basicsCheck(resume, brandLine, searchTerms),
    resultsCheck(resume),
    proofCheck(skills, bestFit.length),
    storiesCheck(coveredThemes),
    pitchValuesCheck(entries.pitch, entries.values),
    freshCheck(
      latestMs([
        input.resumeUpdatedAt,
        entries.singletonsUpdatedAt,
        ...entries.stories.map((s) => s.updatedAt),
      ]),
      now,
    ),
  ];

  return {
    dataState,
    bestFitJobCount: bestFit.length,
    generatedAt: now.toISOString(),
    brand,
    pitch: pitchInsight,
    values,
    stories,
    skills,
    roles,
    landing,
    strength: {
      total: checks.reduce((sum, c) => sum + c.points, 0),
      max: 100,
      checks,
    },
    skillsRefreshedAt: entries.skills?.refreshedAt ?? null,
  };
}

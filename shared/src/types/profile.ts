import { z } from "zod";

/** Story themes, in display order. */
export const PROFILE_THEMES = [
  "delivery",
  "analytics",
  "customer",
  "leadership",
  "influence",
  "failure",
] as const;
export const ThemeSchema = z.enum(PROFILE_THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

export const PROFILE_ENTRY_KINDS = [
  "brand",
  "pitch",
  "values",
  "story",
  "skills",
] as const;
export const ProfileEntryKindSchema = z.enum(PROFILE_ENTRY_KINDS);
export type ProfileEntryKind = z.infer<typeof ProfileEntryKindSchema>;

/** Kinds stored as exactly one row per user. */
export const PROFILE_SINGLETON_KINDS = [
  "brand",
  "pitch",
  "values",
  "skills",
] as const;
export const ProfileSingletonKindSchema = z.enum(PROFILE_SINGLETON_KINDS);
export type ProfileSingletonKind = z.infer<typeof ProfileSingletonKindSchema>;

const slider = z.number().int().min(0).max(100);

export const BrandEntrySchema = z.object({
  line: z.string().max(400),
  industries: z.array(z.string().min(1).max(80)).max(20),
});
export type BrandEntry = z.infer<typeof BrandEntrySchema>;

export const PitchEntrySchema = z.object({
  s15: z.string().max(1500),
  s30: z.string().max(3000),
  s60: z.string().max(6000),
  builtFrom: z.object({
    storyIds: z.array(z.string()).max(50),
    values: z.array(z.string()).max(50),
  }),
});
export type PitchEntry = z.infer<typeof PitchEntrySchema>;

export const ValuesEntrySchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        starred: z.boolean(),
      }),
    )
    .max(30),
  /** Ideal-role sliders, 0 to 100. size: startup(0)..enterprise(100). */
  ideal: z.object({
    size: slider,
    /** hands-on(0)..managing(100) */
    management: slider,
    /** remote(0)..in office(100) */
    office: slider,
  }),
});
export type ValuesEntry = z.infer<typeof ValuesEntrySchema>;

export const StoryEntrySchema = z.object({
  title: z.string().min(1).max(200),
  themes: z.array(ThemeSchema).max(PROFILE_THEMES.length),
  situation: z.string().max(4000),
  task: z.string().max(4000),
  action: z.string().max(4000),
  result: z.string().max(4000),
  metric: z.string().max(200).nullable(),
  source: z.literal("manual"),
});
export type StoryEntry = z.infer<typeof StoryEntrySchema>;

export const SkillSourceSchema = z.enum(["starter", "ai", "user"]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  /** Plain terms; see StarterSkillKeyword for matching rules. */
  keywords: z.array(z.string().min(1).max(80)).max(40),
  hidden: z.boolean(),
  source: SkillSourceSchema,
});
export type SkillItem = z.infer<typeof SkillItemSchema>;

export const SkillsEntrySchema = z.object({
  items: z.array(SkillItemSchema).max(60),
  refreshedAt: z.string().nullable(),
});
export type SkillsEntry = z.infer<typeof SkillsEntrySchema>;

/** Stored row, as returned by the entries routes. */
export interface ProfileEntryRow<TData = unknown> {
  id: string;
  kind: ProfileEntryKind;
  data: TData;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileEntriesResponse {
  brand: BrandEntry | null;
  pitch: PitchEntry | null;
  values: ValuesEntry | null;
  skills: SkillsEntry | null;
  stories: ProfileEntryRow<StoryEntry>[];
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/** ok: enough scored jobs; too-early: resume present but < 5 scored jobs. */
export type ProfileDataState = "ok" | "too-early" | "no-resume";

/** 0 listed only, 0.5 core strengths only, 1 in a role/project, 2 with a number, 3 saved story. */
export type SkillProofLevel = 0 | 0.5 | 1 | 2 | 3;

export type SkillQuadrant =
  | "lead-with" // high demand, strong proof
  | "prove" // high demand, weak proof
  | "hidden" // low demand, strong proof
  | "nice-to-have"; // low demand, weak proof

export type ProfileActionId =
  | "edit-resume"
  | "add-story"
  | "edit-pitch"
  | "edit-values"
  | "edit-brand";

export type RoleTag = "Core fit" | "Step up" | "Adjacent" | "Stretch";

export interface ProfileBrandInsight {
  /** Up to two letters from the resume name. */
  initials: string;
  /** Saved brand line, else resume headline, else null. */
  line: string | null;
  lineSource: "saved" | "headline" | "none";
  targetRoles: string[];
  location: string | null;
  industries: string[];
}

export interface ProfilePitchInsight {
  s15: string;
  s30: string;
  s60: string;
  /** Resolved "built from" chips. */
  builtFrom: { stories: { id: string; title: string }[]; values: string[] };
  isEmpty: boolean;
}

export interface ProfileValuesInsight {
  items: { label: string; starred: boolean }[];
  ideal: { size: number; management: number; office: number } | null;
}

export interface ProfileStoryTheme {
  theme: Theme;
  count: number;
}

export interface ProfileTopStory {
  id: string;
  title: string;
  themes: Theme[];
  result: string;
  metric: string | null;
}

export interface ProfileStoriesInsight {
  total: number;
  themes: ProfileStoryTheme[];
  /** Top 3 by result strength. */
  top: ProfileTopStory[];
}

export interface ProfileSkillInsight {
  id: string;
  label: string;
  /** Share of best-fit jobs mentioning the skill, 0 to 100. */
  demandPct: number;
  /** Number of best-fit jobs mentioning it. */
  demandCount: number;
  proof: SkillProofLevel;
  quadrant: SkillQuadrant;
  source: SkillSource;
}

export interface ProfileRoleInsight {
  /** Stable role family id, used for the Jobs filter. */
  familyId: string;
  label: string;
  tag: RoleTag;
  /** Average suitability of the family's jobs scoring 50 or more. */
  fit: number;
  jobCount: number;
  strongCount: number;
  appliedCount: number;
  /** Jobs in the feed (not yet applied/closed) for this family. */
  openCount: number;
  why: string;
  gap: string;
  topSkills: string[];
}

export interface ProfileLandingInsight {
  applications: number;
  /** Average fit of applied jobs, null when none are scored. */
  averageFit: number | null;
  best: {
    jobId: string;
    title: string;
    employer: string;
    score: number;
  } | null;
  /** Share (0 to 100) of applications in families averaging under 45; null if no applications. */
  lowFitSharePct: number | null;
  lowFitFamilies: string[];
}

export interface ProfileStrengthCheck {
  id: "basics" | "results" | "proof" | "stories" | "pitch-values" | "fresh";
  label: string;
  points: number;
  max: number;
  /** How the check is scored, one line. */
  how: string;
  /** Short fix message when points < max. */
  fix?: string;
  action?: ProfileActionId;
}

export interface ProfileStrength {
  total: number;
  max: 100;
  checks: ProfileStrengthCheck[];
}

export interface ProfileInsightsResponse {
  dataState: ProfileDataState;
  /** Best-fit job count the skill demand was computed over. */
  bestFitJobCount: number;
  generatedAt: string;
  brand: ProfileBrandInsight;
  pitch: ProfilePitchInsight;
  values: ProfileValuesInsight;
  stories: ProfileStoriesInsight;
  skills: ProfileSkillInsight[];
  /** Up to 4. */
  roles: ProfileRoleInsight[];
  landing: ProfileLandingInsight;
  strength: ProfileStrength;
  skillsRefreshedAt: string | null;
}

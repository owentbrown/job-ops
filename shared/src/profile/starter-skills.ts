/**
 * A keyword the skill-demand matcher looks for in job descriptions and resume
 * text. Matching (implemented in the profile compute task) is case-insensitive
 * and whole-word: the term must start and end on a word boundary.
 * With `prefix: true` the end boundary is dropped, so "prioriti" matches
 * "prioritise", "prioritization" and "prioritizing". Terms are plain text
 * (never regex source); the matcher escapes them.
 *
 * Saved skill keywords (SkillItem.keywords) are plain strings, so a prefix
 * keyword is saved with a trailing "*" ("prioriti*"). Use toSavedKeyword /
 * parseSavedKeyword to convert between the two forms.
 */
export interface StarterSkillKeyword {
  term: string;
  prefix?: boolean;
}

export interface StarterSkillGroup {
  id: string;
  label: string;
  keywords: StarterSkillKeyword[];
}

const k = (term: string, prefix = false): StarterSkillKeyword =>
  prefix ? { term, prefix: true } : { term };

export const STARTER_SKILL_GROUPS: StarterSkillGroup[] = [
  {
    id: "cross-functional",
    label: "Cross-functional alignment",
    keywords: [k("cross-functional"), k("stakeholder")],
  },
  {
    id: "roadmap",
    label: "Roadmap & prioritization",
    keywords: [k("roadmap"), k("prioriti", true)],
  },
  {
    id: "ai-ml",
    label: "AI / ML",
    keywords: [k("AI"), k("machine learning"), k("LLM"), k("generative")],
  },
  {
    id: "exec-comms",
    label: "Executive communication",
    keywords: [
      k("executive"),
      k("senior leadership"),
      k("C-suite"),
      k("leadership team"),
    ],
  },
  {
    id: "gtm",
    label: "Go-to-market & launches",
    keywords: [k("go-to-market"), k("GTM"), k("launch")],
  },
  {
    id: "technical",
    label: "Technical fluency",
    keywords: [k("API", true), k("technical")],
  },
  {
    id: "kpis",
    label: "KPIs & OKRs",
    keywords: [k("KPI", true), k("metrics"), k("OKR", true)],
  },
  {
    id: "customer-research",
    label: "Customer research",
    keywords: [
      k("user research"),
      k("customer research"),
      k("customer insight"),
      k("customer interview"),
      k("discovery"),
      k("voice of the customer"),
    ],
  },
  {
    id: "people-leadership",
    label: "People leadership",
    keywords: [
      k("direct reports"),
      k("people manage"),
      k("manage a team"),
      k("lead a team"),
      k("coach"),
    ],
  },
  {
    id: "sql-data",
    label: "SQL & data analysis",
    keywords: [
      k("SQL"),
      k("data analysis"),
      k("analytical skills"),
      k("Tableau"),
      k("Looker"),
      k("Power BI"),
      k("Amplitude"),
      k("Mixpanel"),
    ],
  },
  {
    id: "agile",
    label: "Agile delivery",
    keywords: [
      k("agile"),
      k("scrum"),
      k("sprint"),
      k("backlog"),
      k("user stor", true),
    ],
  },
  {
    id: "business-cases",
    label: "Business cases & sizing",
    keywords: [
      k("business case"),
      k("opportunity sizing"),
      k("market sizing"),
      k("ROI"),
      k("sizing"),
    ],
  },
  {
    id: "saas-b2b",
    label: "SaaS / B2B",
    keywords: [k("SaaS"), k("B2B")],
  },
  {
    id: "pricing",
    label: "Pricing & monetization",
    keywords: [k("pricing"), k("monetiz", true)],
  },
  {
    id: "experimentation",
    label: "Experimentation",
    keywords: [k("A/B"), k("experiment")],
  },
  {
    id: "financial-modelling",
    label: "Financial modelling",
    keywords: [k("financial model"), k("P&L"), k("forecast")],
  },
];

/** Marks a saved keyword as a prefix match: "prioriti*". */
export const PREFIX_MARKER = "*";

/** Starter keyword to its saved string form ("prioriti" + prefix -> "prioriti*"). */
export function toSavedKeyword(keyword: StarterSkillKeyword): string {
  const term = keyword.term.trim();
  return keyword.prefix ? `${term}${PREFIX_MARKER}` : term;
}

/**
 * Saved keyword string to a matcher keyword: a trailing "*" (one or more)
 * makes it a prefix match. "*" on its own gives an empty term, which the
 * matcher ignores.
 */
export function parseSavedKeyword(saved: string): StarterSkillKeyword {
  const trimmed = saved.trim();
  const term = trimmed.replace(/\*+$/, "").trim();
  return term.length < trimmed.length ? { term, prefix: true } : { term };
}

/**
 * The starter groups as saved skill items (structurally a SkillItem), with
 * prefix keywords in their "term*" form so saving them keeps prefix matching.
 */
export function starterSkillItems(): {
  id: string;
  label: string;
  keywords: string[];
  hidden: boolean;
  source: "starter";
}[] {
  return STARTER_SKILL_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    keywords: g.keywords.map(toSavedKeyword),
    hidden: false,
    source: "starter" as const,
  }));
}

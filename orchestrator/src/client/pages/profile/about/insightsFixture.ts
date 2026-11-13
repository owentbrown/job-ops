import type { ProfileDataState, ProfileInsightsResponse } from "@shared/types";

/** Test fixture for About you cards. Not imported by app code. */
export function makeInsights(
  dataState: ProfileDataState = "ok",
  overrides: Partial<ProfileInsightsResponse> = {},
): ProfileInsightsResponse {
  const ok = dataState === "ok";
  return {
    dataState,
    bestFitJobCount: ok ? 31 : 0,
    generatedAt: "2026-11-12T10:00:00.000Z",
    brand: {
      initials: dataState === "no-resume" ? "" : "SP",
      line:
        dataState === "no-resume"
          ? null
          : "Strategy lead who turns fuzzy problems into funded plans.",
      lineSource: dataState === "no-resume" ? "none" : "saved",
      targetRoles: ["Product Manager", "Product Strategy"],
      location: "Kitchener, ON",
      industries: ["Insurance", "AI products"],
    },
    pitch: {
      s15: "I turn fuzzy problems into funded plans.",
      s30: "I turn fuzzy problems into funded plans, then deliver them.",
      s60: "",
      builtFrom: {
        stories: [{ id: "st1", title: "Cut call volume" }],
        values: ["Ownership"],
      },
      isEmpty: false,
    },
    values: {
      items: [
        { label: "Ownership", starred: true },
        { label: "Learning", starred: false },
      ],
      ideal: { size: 70, management: 40, office: 20 },
    },
    stories: {
      total: 2,
      themes: [
        { theme: "delivery", count: 2 },
        { theme: "analytics", count: 1 },
        { theme: "customer", count: 0 },
        { theme: "leadership", count: 0 },
        { theme: "influence", count: 0 },
        { theme: "failure", count: 0 },
      ],
      top: [
        {
          id: "st1",
          title: "Cut call volume",
          themes: ["delivery", "analytics"],
          result: "Removed 100K calls a year",
          metric: "100K calls",
        },
        {
          id: "st2",
          title: "Funded the roadmap",
          themes: ["delivery"],
          result: "$20M approved",
          metric: null,
        },
      ],
    },
    skills: ok
      ? [
          {
            id: "alignment",
            label: "Cross-functional alignment",
            demandPct: 81,
            demandCount: 25,
            proof: 3,
            quadrant: "lead-with",
            source: "starter",
          },
          {
            id: "ai-ml",
            label: "AI/ML",
            demandPct: 62,
            demandCount: 19,
            proof: 0.5,
            quadrant: "prove",
            source: "starter",
          },
          {
            id: "sql",
            label: "SQL & data analysis",
            demandPct: 20,
            demandCount: 6,
            proof: 2,
            quadrant: "hidden",
            source: "starter",
          },
          {
            id: "pricing",
            label: "Pricing & monetization",
            demandPct: 10,
            demandCount: 3,
            proof: 0,
            quadrant: "nice-to-have",
            source: "starter",
          },
        ]
      : [],
    roles: ok
      ? [
          {
            familyId: "product-manager",
            label: "Product Manager / Owner",
            tag: "Core fit",
            fit: 72,
            jobCount: 14,
            strongCount: 6,
            appliedCount: 3,
            openCount: 5,
            why: "Strong proof for cross-functional alignment.",
            gap: "Needs proof for AI/ML.",
            topSkills: ["Cross-functional alignment", "AI/ML"],
          },
          {
            familyId: "growth",
            label: "Growth / GTM",
            tag: "Stretch",
            fit: 48,
            jobCount: 4,
            strongCount: 0,
            appliedCount: 1,
            openCount: 0,
            why: "Some launch experience.",
            gap: "Little proof for pricing.",
            topSkills: ["Pricing & monetization"],
          },
        ]
      : [],
    landing: ok
      ? {
          applications: 9,
          averageFit: 61.4,
          best: {
            jobId: "j1",
            title: "Strategy Lead",
            employer: "Acme",
            score: 84,
          },
          lowFitSharePct: 33,
          lowFitFamilies: ["Growth / GTM"],
        }
      : {
          applications: 0,
          averageFit: null,
          best: null,
          lowFitSharePct: null,
          lowFitFamilies: [],
        },
    strength: {
      total: 63,
      max: 100,
      checks: [
        {
          id: "basics",
          label: "Basics",
          points: 10,
          max: 10,
          how: "Name, location, email, LinkedIn, brand line.",
        },
        {
          id: "results",
          label: "Results in experience",
          points: 12,
          max: 20,
          how: "Share of bullets with a number.",
          fix: "Add numbers to 4 bullets.",
          action: "edit-resume",
        },
        {
          id: "proof",
          label: "Proof for in-demand skills",
          points: 15,
          max: 25,
          how: "Proof for skills most jobs ask for.",
          fix: "Write a story for AI/ML.",
          action: "add-story",
        },
        {
          id: "stories",
          label: "Story coverage",
          points: 6.7,
          max: 20,
          how: "One story per theme.",
          fix: "Add stories for 4 themes.",
          action: "add-story",
        },
        {
          id: "pitch-values",
          label: "Pitch and values",
          points: 6,
          max: 10,
          how: "Three pitch lengths, values and ideal role.",
          fix: "Write a 60-second pitch.",
          action: "edit-pitch",
        },
        {
          id: "fresh",
          label: "Fresh",
          points: 15,
          max: 15,
          how: "Updated in the last 60 days.",
        },
      ],
    },
    skillsRefreshedAt: null,
    ...overrides,
  };
}

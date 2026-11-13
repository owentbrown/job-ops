import type { ProfileEntryRow, StoryEntry } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  buildProfileContext,
  buildWritePrompt,
  NO_INVENTION_RULE,
  PLACEHOLDER_RULE,
  sanitizeDraft,
} from "./ai-write";
import {
  computeProfileInsights,
  type ProfileInsightsInput,
  type ProfileJobRow,
} from "./compute";

const NOW = new Date("2026-11-12T12:00:00Z");
const LONG = `Own the roadmap and align stakeholders. ${"x ".repeat(200)}`;

const job = (i: number): ProfileJobRow => ({
  id: `j${i}`,
  title: "Product Manager",
  employer: "Acme",
  status: "discovered",
  suitabilityScore: 70,
  description: LONG,
  appliedAt: null,
  stage: null,
});

const storyRow: ProfileEntryRow<StoryEntry> = {
  id: "s1",
  kind: "story",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  data: {
    title: "Pricing relaunch",
    themes: ["delivery"],
    situation: "",
    task: "",
    action: "",
    result: "ARPU up 12%",
    metric: "+12% ARPU",
    source: "manual",
  },
};

const input = (
  over: Partial<ProfileInsightsInput> = {},
): ProfileInsightsInput => ({
  resume: {
    basics: {
      name: "Alex Example",
      headline: "Strategy & operations leader",
      location: "Toronto",
      email: "",
      profiles: [],
    },
    summary: "<p>Ten years in B2B SaaS.</p>",
    experience: [
      {
        position: "Senior Manager",
        company: "Sun Life",
        period: "2020 - 2024",
        description: "<ul><li>Owned the roadmap for 3 products</li></ul>",
      },
    ],
    projects: [{ name: "Pricing tool", description: "<p>Built in Python</p>" }],
    skills: [],
  },
  resumeUpdatedAt: NOW.toISOString(),
  searchTerms: ["Product Manager", "Strategy Manager"],
  jobs: Array.from({ length: 6 }, (_, i) => job(i)),
  entries: {
    brand: { line: "PM for B2B SaaS", industries: [] },
    pitch: null,
    values: {
      items: [{ label: "Autonomy", starred: true }],
      ideal: { size: 20, management: 40, office: 10 },
    },
    skills: null,
    stories: [storyRow],
    singletonsUpdatedAt: null,
  },
  now: NOW,
  ...over,
});

describe("buildProfileContext", () => {
  it("includes resume, target roles, skills, roles, stories and values", () => {
    const data = input();
    const context = buildProfileContext(data, computeProfileInsights(data));
    expect(context).toContain("Headline: Strategy & operations leader");
    expect(context).toContain("Ten years in B2B SaaS.");
    expect(context).toContain("Senior Manager at Sun Life (2020 - 2024)");
    expect(context).toContain("Owned the roadmap for 3 products");
    expect(context).toContain("Pricing tool: Built in Python");
    expect(context).toContain("Product Manager, Strategy Manager");
    expect(context).toContain("Roadmap & prioritization (asked for in 100%");
    expect(context).toContain("Best-fit role families");
    expect(context).toContain("Pricing relaunch: ARPU up 12%");
    expect(context).toContain("Autonomy (non-negotiable)");
  });

  it("says so when the profile is empty", () => {
    const data = input({
      resume: null,
      searchTerms: [],
      jobs: [],
      entries: { ...input().entries, brand: null, values: null, stories: [] },
    });
    expect(buildProfileContext(data, computeProfileInsights(data))).toContain(
      "profile is empty",
    );
  });
});

describe("buildWritePrompt", () => {
  it("carries the rules, the notes and the current draft", () => {
    const prompt = buildWritePrompt(
      {
        target: "pitch",
        notes: "Mention my move into AI products",
        current: { s15: "I build products." },
      },
      "CONTEXT",
    );
    expect(prompt).toContain(NO_INVENTION_RULE);
    expect(prompt).toContain(PLACEHOLDER_RULE);
    expect(prompt).toContain("about 40 words");
    expect(prompt).toContain("about 75 words");
    expect(prompt).toContain("about 150 words");
    expect(prompt).toContain("Mention my move into AI products");
    expect(prompt).toContain("I build products.");
    expect(prompt).toContain("CONTEXT");
  });

  it("leaves out an empty current draft", () => {
    const prompt = buildWritePrompt(
      { target: "brand", current: { line: "  " } },
      "CONTEXT",
    );
    expect(prompt).not.toContain("## Current draft");
    expect(prompt).toContain("(none)");
  });
});

describe("sanitizeDraft", () => {
  it("keeps known themes, turns an empty metric into null and caps follow-ups", () => {
    const draft = sanitizeDraft(
      { target: "story" },
      {
        title: " Churn fix ",
        themes: ["delivery", "nonsense", "analytics"],
        situation: "s",
        task: "t",
        action: "a",
        result: "Churn down [X%]",
        metric: "",
        followUps: ["a", "b", "c", "d", "e", "f"],
      },
    );
    expect(draft).toEqual({
      title: "Churn fix",
      themes: ["delivery", "analytics"],
      situation: "s",
      task: "t",
      action: "a",
      result: "Churn down [X%]",
      metric: null,
      followUps: ["a", "b", "c", "d", "e"],
    });
  });

  it("clamps sliders and falls back to the current ideal", () => {
    const draft = sanitizeDraft(
      {
        target: "values",
        current: { ideal: { size: 10, management: 20, office: 30 } },
      },
      {
        items: [
          { label: "Autonomy", starred: true },
          { label: "autonomy", starred: false },
        ],
        ideal: { size: 140, management: -5 },
      },
    );
    expect(draft).toEqual({
      items: [{ label: "Autonomy", starred: true }],
      ideal: { size: 100, management: 0, office: 30 },
    });
  });

  it("returns null for empty drafts", () => {
    expect(
      sanitizeDraft({ target: "pitch" }, { s15: "", s30: "", s60: "" }),
    ).toBeNull();
    expect(sanitizeDraft({ target: "brand" }, { line: " " })).toBeNull();
    expect(sanitizeDraft({ target: "values" }, { items: [] })).toBeNull();
    expect(sanitizeDraft({ target: "story" }, null)).toBeNull();
  });
});

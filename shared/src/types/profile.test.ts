import { describe, expect, it } from "vitest";
import {
  parseSavedKeyword,
  STARTER_SKILL_GROUPS,
  toSavedKeyword,
} from "../profile/starter-skills";
import {
  BrandEntrySchema,
  PitchEntrySchema,
  SkillsEntrySchema,
  StoryEntrySchema,
  ValuesEntrySchema,
} from "./profile";

const story = {
  title: "Launched pricing",
  themes: ["delivery", "analytics"],
  situation: "s",
  task: "t",
  action: "a",
  result: "r",
  metric: "+12% ARPU",
  source: "manual",
};

describe("profile entry schemas", () => {
  it("accepts good input", () => {
    expect(
      BrandEntrySchema.safeParse({ line: "PM", industries: ["SaaS"] }).success,
    ).toBe(true);
    expect(
      PitchEntrySchema.safeParse({
        s15: "",
        s30: "",
        s60: "",
        builtFrom: { storyIds: [], values: [] },
      }).success,
    ).toBe(true);
    expect(
      ValuesEntrySchema.safeParse({
        items: [{ label: "Craft", starred: true }],
        ideal: { size: 20, management: 50, office: 100 },
      }).success,
    ).toBe(true);
    expect(StoryEntrySchema.safeParse(story).success).toBe(true);
    expect(
      SkillsEntrySchema.safeParse({
        items: [
          {
            id: "sql",
            label: "SQL",
            keywords: ["SQL"],
            hidden: false,
            source: "user",
          },
        ],
        refreshedAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects bad input", () => {
    expect(BrandEntrySchema.safeParse({ line: "x" }).success).toBe(false);
    expect(
      StoryEntrySchema.safeParse({ ...story, themes: ["nonsense"] }).success,
    ).toBe(false);
    expect(StoryEntrySchema.safeParse({ ...story, title: "" }).success).toBe(
      false,
    );
    expect(StoryEntrySchema.safeParse({ ...story, source: "ai" }).success).toBe(
      false,
    );
    expect(
      ValuesEntrySchema.safeParse({
        items: [],
        ideal: { size: 101, management: 0, office: 0 },
      }).success,
    ).toBe(false);
    expect(
      SkillsEntrySchema.safeParse({
        items: [
          { id: "a", label: "A", keywords: [], hidden: false, source: "x" },
        ],
        refreshedAt: null,
      }).success,
    ).toBe(false);
  });
});

describe("starter skills", () => {
  it("has 16 groups with unique ids and non-empty keywords", () => {
    expect(STARTER_SKILL_GROUPS).toHaveLength(16);
    const ids = STARTER_SKILL_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of STARTER_SKILL_GROUPS) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.keywords.length).toBeGreaterThan(0);
      for (const kw of g.keywords) expect(kw.term.trim()).toBe(kw.term);
    }
  });
});

describe("saved keyword prefix marker", () => {
  it("round-trips starter keywords", () => {
    expect(toSavedKeyword({ term: "prioriti", prefix: true })).toBe(
      "prioriti*",
    );
    expect(toSavedKeyword({ term: "roadmap" })).toBe("roadmap");
    for (const g of STARTER_SKILL_GROUPS) {
      for (const k of g.keywords) {
        expect(parseSavedKeyword(toSavedKeyword(k))).toEqual(k);
      }
    }
  });

  it("parses a trailing * as prefix and ignores a bare *", () => {
    expect(parseSavedKeyword(" user stor* ")).toEqual({
      term: "user stor",
      prefix: true,
    });
    expect(parseSavedKeyword("SQL")).toEqual({ term: "SQL" });
    expect(parseSavedKeyword("*")).toEqual({ term: "", prefix: true });
  });

  it("saved starter items pass the skills schema", () => {
    expect(() =>
      SkillsEntrySchema.parse({
        items: STARTER_SKILL_GROUPS.map((g) => ({
          id: g.id,
          label: g.label,
          keywords: g.keywords.map(toSavedKeyword),
          hidden: false,
          source: "starter",
        })),
        refreshedAt: null,
      }),
    ).not.toThrow();
  });
});

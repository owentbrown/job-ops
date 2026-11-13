import type { SkillItem } from "@shared/types";
import { describe, expect, it } from "vitest";
import type { ProfileJobRow } from "./compute";
import {
  currentSkillItems,
  MAX_AI_SKILLS,
  MAX_DESCRIPTION_CHARS,
  MAX_REFRESH_JOBS,
  mergeRefreshedSkills,
  sanitizeAiSkills,
  selectRefreshDescriptions,
} from "./skills-refresh";

const NOW = "2026-11-13T12:00:00.000Z";

function item(overrides: Partial<SkillItem> & { id: string }): SkillItem {
  return {
    label: overrides.id,
    keywords: ["old"],
    hidden: false,
    source: "ai",
    ...overrides,
  };
}

function job(i: number, overrides: Partial<ProfileJobRow> = {}): ProfileJobRow {
  return {
    id: `job-${i}`,
    title: "Product Manager",
    employer: "Acme",
    status: "discovered",
    suitabilityScore: 60,
    description: `Job ${i} `.padEnd(400, "x"),
    appliedAt: null,
    stage: null,
    ...overrides,
  };
}

describe("mergeRefreshedSkills", () => {
  it("keeps user items untouched, even when the AI returns the same label", () => {
    const current = [
      item({ id: "u1", label: "SQL", keywords: ["sql"], source: "user" }),
    ];
    const { entry, added, updated } = mergeRefreshedSkills(
      current,
      [{ label: "sql", keywords: ["SQL", "BigQuery"] }],
      NOW,
    );
    expect(entry.items).toEqual(current);
    expect(added).toBe(0);
    expect(updated).toBe(0);
  });

  it("keeps hidden items and does not re-add them", () => {
    const hidden = item({ id: "h1", label: "Pricing", hidden: true });
    const { entry } = mergeRefreshedSkills(
      [hidden],
      [{ label: "PRICING", keywords: ["pricing"] }],
      NOW,
    );
    expect(entry.items).toEqual([hidden]);
  });

  it("updates keywords of a starter/ai item whose label matches case-insensitively", () => {
    const { entry, updated } = mergeRefreshedSkills(
      [
        item({
          id: "roadmap",
          label: "Roadmap & prioritization",
          source: "starter",
        }),
      ],
      [{ label: "roadmap & PRIORITIZATION", keywords: ["roadmap", "backlog"] }],
      NOW,
    );
    expect(updated).toBe(1);
    expect(entry.items).toEqual([
      {
        id: "roadmap",
        label: "Roadmap & prioritization",
        keywords: ["roadmap", "backlog"],
        hidden: false,
        source: "starter",
      },
    ]);
  });

  it("adds new skills as source ai and drops unmatched starter/ai items", () => {
    const { entry, added } = mergeRefreshedSkills(
      [
        item({ id: "old-ai", label: "Old thing" }),
        item({ id: "starter-x", label: "Starter X", source: "starter" }),
        item({ id: "mine", label: "Mine", source: "user" }),
      ],
      [{ label: "Vendor management", keywords: ["vendor", "procurement"] }],
      NOW,
    );
    expect(added).toBe(1);
    expect(entry.items.map((i) => i.id)).toEqual([
      "mine",
      "ai-vendor-management",
    ]);
    expect(entry.items[1]).toMatchObject({ source: "ai", hidden: false });
  });

  it("sets refreshedAt and makes new ids unique", () => {
    const { entry } = mergeRefreshedSkills(
      [item({ id: "ai-ops", label: "Ops (user)", source: "user" })],
      [{ label: "Ops", keywords: ["operations"] }],
      NOW,
    );
    expect(entry.refreshedAt).toBe(NOW);
    expect(entry.items.map((i) => i.id)).toEqual(["ai-ops", "ai-ops-2"]);
  });

  it("stays within the 60-item limit", () => {
    const current = Array.from({ length: 55 }, (_, i) =>
      item({ id: `u${i}`, label: `User ${i}`, source: "user" }),
    );
    const ai = Array.from({ length: 20 }, (_, i) => ({
      label: `AI ${i}`,
      keywords: ["k"],
    }));
    const { entry, added } = mergeRefreshedSkills(current, ai, NOW);
    expect(entry.items).toHaveLength(60);
    expect(added).toBe(5);
  });
});

describe("sanitizeAiSkills", () => {
  it("trims, dedupes, drops empty items and caps at 20", () => {
    const raw = [
      { label: "  SQL  ", keywords: [" sql ", "SQL", "", 3, "BigQuery"] },
      { label: "sql", keywords: ["dup"] },
      { label: "No keywords", keywords: [] },
      { label: "", keywords: ["x"] },
      "junk",
      ...Array.from({ length: 30 }, (_, i) => ({
        label: `Skill ${i}`,
        keywords: ["k"],
      })),
    ];
    const out = sanitizeAiSkills(raw);
    expect(out[0]).toEqual({ label: "SQL", keywords: ["sql", "BigQuery"] });
    expect(out).toHaveLength(MAX_AI_SKILLS);
    expect(out.filter((s) => s.label.toLowerCase() === "sql")).toHaveLength(1);
  });

  it("returns [] for a non-array", () => {
    expect(sanitizeAiSkills(undefined)).toEqual([]);
  });
});

describe("selectRefreshDescriptions", () => {
  it("takes at most 40 best-fit jobs, highest score first, trimmed to 1,500 chars", () => {
    const jobs = Array.from({ length: 50 }, (_, i) =>
      job(i, {
        suitabilityScore: 50 + (i % 50),
        description: `<p>Job ${i}</p>${"y".repeat(2000)}`,
      }),
    );
    const out = selectRefreshDescriptions(jobs);
    expect(out).toHaveLength(MAX_REFRESH_JOBS);
    expect(out.every((d) => d.length <= MAX_DESCRIPTION_CHARS)).toBe(true);
    expect(out[0].startsWith("Job 49")).toBe(true);
    expect(out[0]).not.toContain("<p>");
  });

  it("skips jobs that are neither best-fit nor scored", () => {
    expect(
      selectRefreshDescriptions([job(1, { suitabilityScore: null })]),
    ).toEqual([]);
  });
});

describe("currentSkillItems", () => {
  it("falls back to the starter groups", () => {
    const items = currentSkillItems(null);
    expect(items.length).toBe(16);
    expect(items.every((i) => i.source === "starter" && !i.hidden)).toBe(true);
  });

  it("keeps starter prefix keywords as term*", () => {
    const items = currentSkillItems(null);
    const kw = (id: string) => items.find((i) => i.id === id)?.keywords;
    expect(kw("roadmap")).toEqual(["roadmap", "prioriti*"]);
    expect(kw("pricing")).toEqual(["pricing", "monetiz*"]);
    expect(kw("kpis")).toEqual(["KPI*", "metrics", "OKR*"]);
    expect(kw("technical")).toContain("API*");
    expect(kw("agile")).toContain("user stor*");
  });
});

describe("prefix keywords through a refresh", () => {
  it("sanitize keeps a trailing *", () => {
    expect(
      sanitizeAiSkills([
        { label: "Roadmap", keywords: [" prioriti* ", "roadmap"] },
      ]),
    ).toEqual([{ label: "Roadmap", keywords: ["prioriti*", "roadmap"] }]);
  });

  it("merge preserves * on kept, updated and added items", () => {
    const current = currentSkillItems(null);
    const { entry } = mergeRefreshedSkills(
      [
        ...current.filter((i) => i.id === "pricing"),
        item({
          id: "mine",
          label: "Mine",
          keywords: ["monetiz*"],
          source: "user",
        }),
      ],
      [
        { label: "Pricing & monetization", keywords: ["pricing", "monetiz*"] },
        { label: "Delivery", keywords: ["ship*"] },
      ],
      NOW,
    );
    const kw = (label: string) =>
      entry.items.find((i) => i.label === label)?.keywords;
    expect(kw("Pricing & monetization")).toEqual(["pricing", "monetiz*"]);
    expect(kw("Mine")).toEqual(["monetiz*"]);
    expect(kw("Delivery")).toEqual(["ship*"]);
  });
});

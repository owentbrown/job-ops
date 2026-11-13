import type {
  ProfileEntryRow,
  ProfileStrengthCheck,
  StoryEntry,
  Theme,
} from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  bestFitJobs,
  bulletHasNumber,
  computeProfileInsights,
  htmlToText,
  matchSkill,
  type ProfileInsightsInput,
  type ProfileJobRow,
  type ProfileResumeInput,
  proofLevel,
  quadrantFor,
  roleFamilyFor,
  roleTag,
  splitBullets,
} from "./compute";

const NOW = new Date("2026-11-12T12:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) =>
  new Date(NOW.getTime() - daysAgo * DAY).toISOString();

const LONG = "x".repeat(320);

let jobSeq = 0;
const job = (over: Partial<ProfileJobRow> = {}): ProfileJobRow => ({
  id: `j${++jobSeq}`,
  title: "Strategy Manager",
  employer: "Acme",
  status: "discovered",
  suitabilityScore: 60,
  description: LONG,
  appliedAt: null,
  stage: null,
  ...over,
});

const resume = (
  over: Partial<ProfileResumeInput> = {},
): ProfileResumeInput => ({
  basics: {
    name: "Alex Example",
    headline: "Strategy & operations leader",
    location: "Toronto, ON",
    email: "alex@example.com",
    profiles: [{ network: "LinkedIn", url: "https://linkedin.com/in/alex" }],
  },
  summary: "",
  experience: [],
  projects: [],
  skills: [],
  ...over,
});

let storySeq = 0;
const story = (
  over: Partial<StoryEntry> = {},
  updatedAt = iso(1),
): ProfileEntryRow<StoryEntry> => ({
  id: `s${++storySeq}`,
  kind: "story",
  createdAt: updatedAt,
  updatedAt,
  data: {
    title: "A story",
    themes: [],
    situation: "",
    task: "",
    action: "",
    result: "",
    metric: null,
    source: "manual",
    ...over,
  },
});

const input = (
  over: Partial<ProfileInsightsInput> = {},
): ProfileInsightsInput => ({
  resume: resume(),
  resumeUpdatedAt: iso(1),
  searchTerms: ["Strategy Manager"],
  jobs: [],
  entries: {
    brand: null,
    pitch: null,
    values: null,
    skills: null,
    stories: [],
    singletonsUpdatedAt: null,
  },
  now: NOW,
  ...over,
});

const entries = (over: Partial<ProfileInsightsInput["entries"]> = {}) => ({
  ...input().entries,
  ...over,
});

const checkOf = (
  result: ReturnType<typeof computeProfileInsights>,
  id: ProfileStrengthCheck["id"],
) => result.strength.checks.find((c) => c.id === id) as ProfileStrengthCheck;

const ul = (...items: string[]) =>
  `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join("")}</ul>`;

describe("matchSkill", () => {
  it("is case-insensitive and whole-word", () => {
    expect(matchSkill("Build a ROADMAP", [{ term: "roadmap" }])).toBe(true);
    expect(matchSkill("roadmapping", [{ term: "roadmap" }])).toBe(false);
    expect(matchSkill("Key stakeholders", [{ term: "stakeholder" }])).toBe(
      true,
    );
    expect(matchSkill("product launches", [{ term: "launch" }])).toBe(true);
    expect(matchSkill("Experience with AI tools", [{ term: "AI" }])).toBe(true);
    expect(matchSkill("He said so", [{ term: "AI" }])).toBe(false);
    expect(matchSkill("AI-powered", [{ term: "AI" }])).toBe(true);
  });

  it("never matches inside a longer word", () => {
    expect(matchSkill("rapid growth", [{ term: "API", prefix: true }])).toBe(
      false,
    );
    expect(
      matchSkill("capital planning", [{ term: "API", prefix: true }]),
    ).toBe(false);
  });

  it("lets prefix terms run on", () => {
    const k = [{ term: "prioriti", prefix: true }];
    expect(matchSkill("prioritization", k)).toBe(true);
    expect(matchSkill("Prioritise work", k)).toBe(true);
    expect(matchSkill("reprioritize", k)).toBe(false);
    expect(matchSkill("REST APIs", [{ term: "API", prefix: true }])).toBe(true);
  });

  it("handles terms with punctuation and multiple words", () => {
    expect(matchSkill("Own the P&L", [{ term: "P&L" }])).toBe(true);
    expect(matchSkill("run A/B tests", [{ term: "A/B" }])).toBe(true);
    expect(
      matchSkill("Machine  learning", [{ term: "machine learning" }]),
    ).toBe(false);
    expect(matchSkill("machine learning", [{ term: "machine learning" }])).toBe(
      true,
    );
    expect(matchSkill("a.b", [{ term: "." }])).toBe(false);
  });
});

describe("htmlToText", () => {
  it("decodes entities and leaves out-of-range code points as text", () => {
    expect(htmlToText("<p>P&amp;L &#8211; R&#x26;D</p>")).toBe(
      "P&L \u2013 R&D",
    );
    expect(htmlToText("bad &#99999999; and &#x110000; here")).toBe(
      "bad &#99999999; and &#x110000; here",
    );
  });

  it("does not break insights when a job description has a bad entity", () => {
    const jobs = Array.from({ length: 6 }, () =>
      job({ description: `${LONG} SQL &#99999999;` }),
    );
    expect(() =>
      computeProfileInsights(
        input({
          jobs,
          resume: resume({ summary: "<p>&#x7FFFFFFF;</p>" }),
        }),
      ),
    ).not.toThrow();
  });
});

describe("bulletHasNumber and splitBullets", () => {
  it("counts digits but not bare years", () => {
    expect(bulletHasNumber("Cut cost 20%")).toBe(true);
    expect(bulletHasNumber("Grew revenue $1.2M")).toBe(true);
    expect(bulletHasNumber("Led the 2021 migration")).toBe(false);
    expect(bulletHasNumber("Led a team")).toBe(false);
  });

  it("splits <li> items and decodes entities", () => {
    expect(splitBullets(ul("Owned P&amp;L", "Led &nbsp;team"))).toEqual([
      "Owned P&L",
      "Led team",
    ]);
    expect(splitBullets("<p>One</p><p>Two</p>")).toEqual(["One", "Two"]);
    expect(splitBullets("")).toEqual([]);
  });
});

describe("proof levels", () => {
  const kw = [{ term: "roadmap" }];
  const sources = (over: Partial<Parameters<typeof proofLevel>[1]> = {}) => ({
    stories: [],
    bullets: [],
    core: "",
    ...over,
  });

  it("0 when nowhere", () => {
    expect(proofLevel(kw, sources())).toBe(0);
  });
  it("0.5 when only in core strengths", () => {
    expect(proofLevel(kw, sources({ core: "Roadmap" }))).toBe(0.5);
  });
  it("1 when in a bullet without a number", () => {
    expect(proofLevel(kw, sources({ bullets: ["Owned the roadmap"] }))).toBe(1);
  });
  it("2 when a bullet mentions it with a number", () => {
    expect(
      proofLevel(
        kw,
        sources({ bullets: ["Owned the roadmap", "Roadmap for 4 teams"] }),
      ),
    ).toBe(2);
  });
  it("3 when a saved story mentions it", () => {
    expect(
      proofLevel(
        kw,
        sources({ stories: ["Rebuilt the roadmap"], bullets: [] }),
      ),
    ).toBe(3);
  });

  it("flows through computeProfileInsights", () => {
    const res = computeProfileInsights(
      input({
        resume: resume({
          skills: ["Pricing"],
          experience: [
            {
              position: "Lead",
              company: "Co",
              period: "",
              description: ul(
                "Ran agile sprints",
                "Built SQL models for 12 teams",
              ),
            },
          ],
        }),
        entries: entries({
          stories: [story({ action: "Ran an experiment on onboarding" })],
        }),
      }),
    );
    const proof = (id: string) => res.skills.find((s) => s.id === id)?.proof;
    expect(proof("experimentation")).toBe(3);
    expect(proof("sql-data")).toBe(2);
    expect(proof("agile")).toBe(1);
    expect(proof("pricing")).toBe(0.5);
    expect(proof("gtm")).toBe(0);
  });
});

describe("quadrants", () => {
  it("splits at 50% demand and proof 2", () => {
    expect(quadrantFor(50, 2)).toBe("lead-with");
    expect(quadrantFor(50, 1)).toBe("prove");
    expect(quadrantFor(49, 2)).toBe("hidden");
    expect(quadrantFor(49, 1)).toBe("nice-to-have");
    expect(quadrantFor(100, 3)).toBe("lead-with");
    expect(quadrantFor(0, 0)).toBe("nice-to-have");
  });
});

describe("best-fit jobs and demand", () => {
  it("uses applied or 50+ jobs with long descriptions", () => {
    const fits = Array.from({ length: 10 }, () =>
      job({ suitabilityScore: 70 }),
    );
    const applied = job({ suitabilityScore: 20, status: "applied" });
    const short = job({ suitabilityScore: 90, description: "short" });
    const low = job({ suitabilityScore: 30 });
    const set = bestFitJobs([...fits, applied, short, low]);
    expect(set).toHaveLength(11);
    expect(set).toContain(applied);
    expect(set).not.toContain(short);
    expect(set).not.toContain(low);
  });

  it("falls back to all scored jobs under 10", () => {
    const fit = job({ suitabilityScore: 70 });
    const low = job({ suitabilityScore: 30 });
    const unscored = job({ suitabilityScore: null });
    const set = bestFitJobs([fit, low, unscored]);
    expect(set.map((j) => j.id).sort()).toEqual([fit.id, low.id].sort());
  });

  it("computes demand share over the best-fit set", () => {
    const jobs = [
      ...Array.from({ length: 6 }, () =>
        job({ description: `${LONG} We need SQL and a roadmap.` }),
      ),
      ...Array.from({ length: 6 }, () => job({ description: `${LONG} rapid` })),
    ];
    const res = computeProfileInsights(input({ jobs }));
    const sql = res.skills.find((s) => s.id === "sql-data");
    const tech = res.skills.find((s) => s.id === "technical");
    expect(res.bestFitJobCount).toBe(12);
    expect(sql?.demandCount).toBe(6);
    expect(sql?.demandPct).toBe(50);
    expect(tech?.demandPct).toBe(0);
  });

  it("matches HTML descriptions as plain text", () => {
    const jobs = Array.from({ length: 6 }, () =>
      job({
        description: `<div class="sql-widget"><p>${LONG}</p><ul><li>Own the P&amp;L</li></ul></div>`,
      }),
    );
    const res = computeProfileInsights(input({ jobs }));
    const pick = (id: string) => res.skills.find((s) => s.id === id);
    expect(pick("financial-modelling")?.demandPct).toBe(100);
    // "sql" in a class attribute is not a mention.
    expect(pick("sql-data")?.demandPct).toBe(0);
  });

  it("uses saved skills (minus hidden) instead of starters", () => {
    const res = computeProfileInsights(
      input({
        jobs: [job({ description: `${LONG} Snowflake` })],
        entries: entries({
          skills: {
            refreshedAt: "2026-11-01T00:00:00.000Z",
            items: [
              {
                id: "snow",
                label: "Snowflake",
                keywords: ["snowflake"],
                hidden: false,
                source: "ai",
              },
              {
                id: "gone",
                label: "Gone",
                keywords: ["x"],
                hidden: true,
                source: "user",
              },
            ],
          },
        }),
      }),
    );
    expect(res.skills.map((s) => s.id)).toEqual(["snow"]);
    expect(res.skills[0]).toMatchObject({ demandPct: 100, source: "ai" });
    expect(res.skillsRefreshedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("treats a saved keyword ending in * as a prefix match", () => {
    const skills = (keywords: string[]) =>
      entries({
        skills: {
          refreshedAt: null,
          items: [
            {
              id: "p",
              label: "Prioritization",
              keywords,
              hidden: false,
              source: "user",
            },
          ],
        },
      });
    const run = (description: string, keywords: string[]) =>
      computeProfileInsights(
        input({
          jobs: [job({ description: `${LONG} ${description}` })],
          entries: skills(keywords),
        }),
      ).skills[0].demandPct;
    expect(run("Strong prioritization skills", ["prioriti*"])).toBe(100);
    expect(run("Prioritise the backlog", ["prioriti*"])).toBe(100);
    // Still anchored at a word start: no mid-word match.
    expect(run("We reprioritize often", ["prioriti*"])).toBe(0);
    // Without the * it stays whole-word.
    expect(run("Strong prioritization skills", ["prioriti"])).toBe(0);
  });
});

describe("role families", () => {
  it("groups titles by keyword family", () => {
    expect(roleFamilyFor("Senior Product Manager").id).toBe("product-manager");
    expect(roleFamilyFor("Product Owner").id).toBe("product-manager");
    expect(roleFamilyFor("Product Operations Lead").id).toBe("product-ops");
    expect(roleFamilyFor("Technical Program Manager").id).toBe(
      "program-project",
    );
    expect(roleFamilyFor("Manager, Strategy & Operations").id).toBe(
      "strategy-ops",
    );
    expect(roleFamilyFor("Business Operations Manager").id).toBe(
      "strategy-ops",
    );
    expect(roleFamilyFor("Customer Success Manager").id).toBe(
      "customer-success",
    );
    expect(roleFamilyFor("Growth Marketing Lead").id).toBe("growth-gtm");
    expect(roleFamilyFor("Senior Data Analyst").id).toBe("analytics");
    expect(roleFamilyFor("Operations Manager").id).toBe("strategy-ops");
    expect(roleFamilyFor("Barista").id).toBe("other");
  });

  it("tags by average and size", () => {
    expect(roleTag(65, 3, 3)).toBe("Core fit");
    expect(roleTag(64.9, 10, 5)).toBe("Step up");
    expect(roleTag(65, 10, 2)).toBe("Step up");
    expect(roleTag(55, 5, 0)).toBe("Step up");
    expect(roleTag(60, 4, 0)).toBe("Adjacent");
    expect(roleTag(59, 4, 0)).toBe("Stretch");
    expect(roleTag(54, 10, 0)).toBe("Stretch");
  });

  it("builds cards with each tag, excluding Other", () => {
    const fam = (title: string, scores: number[], over = {}) =>
      scores.map((s) => job({ title, suitabilityScore: s, ...over }));
    const res = computeProfileInsights(
      input({
        jobs: [
          ...fam("Strategy Manager", [70, 70, 70, 80]),
          ...fam("Program Manager", [56, 56, 56, 56, 56]),
          ...fam("Data Analyst", [62, 62]),
          ...fam("Product Manager", [40, 45, 50]),
          ...fam("Barista", [90, 90, 90]),
        ],
      }),
    );
    const tags = Object.fromEntries(res.roles.map((r) => [r.familyId, r.tag]));
    expect(tags).toEqual({
      "strategy-ops": "Core fit",
      "program-project": "Step up",
      analytics: "Adjacent",
      "product-manager": "Stretch",
    });
    expect(res.roles.map((r) => r.familyId)).toEqual([
      "strategy-ops",
      "program-project",
      "analytics",
      "product-manager",
    ]);
    const pm = res.roles.find((r) => r.familyId === "product-manager");
    expect(pm).toMatchObject({ jobCount: 3, fit: 50, openCount: 1 });
    const strat = res.roles[0];
    expect(strat).toMatchObject({ fit: 73, strongCount: 4, jobCount: 4 });
  });

  it("counts open jobs as discovered/ready, unapplied, scoring 50+", () => {
    const res = computeProfileInsights(
      input({
        jobs: [
          job({ status: "ready", suitabilityScore: 50 }),
          job({ status: "discovered", suitabilityScore: 49 }),
          job({ status: "skipped", suitabilityScore: 80 }),
          job({
            status: "applied",
            suitabilityScore: 80,
            appliedAt: iso(2),
            stage: "applied",
          }),
          job({ status: "expired", suitabilityScore: 80 }),
        ],
      }),
    );
    expect(res.roles[0]).toMatchObject({ openCount: 1, appliedCount: 1 });
  });

  it("templates why and gap from top skills and proof", () => {
    const res = computeProfileInsights(
      input({
        resume: resume({
          experience: [
            {
              position: "Lead",
              company: "Co",
              period: "",
              description: ul("Owned roadmap for 3 products"),
            },
          ],
        }),
        jobs: Array.from({ length: 5 }, () =>
          job({ description: `${LONG} roadmap and SQL` }),
        ),
      }),
    );
    const role = res.roles[0];
    expect(role.topSkills).toEqual([
      "Roadmap & prioritization",
      "SQL & data analysis",
    ]);
    expect(role.why).toContain("Roadmap & prioritization");
    expect(role.gap).toContain("SQL & data analysis");
    expect(role.gap).not.toContain("Roadmap");
  });
});

describe("landing", () => {
  it("summarises applications", () => {
    const res = computeProfileInsights(
      input({
        jobs: [
          job({
            title: "Strategy Lead",
            suitabilityScore: 80,
            appliedAt: iso(3),
            status: "applied",
          }),
          job({ title: "Strategy Lead", suitabilityScore: 70 }),
          job({
            title: "Barista",
            suitabilityScore: 30,
            appliedAt: iso(4),
            status: "applied",
          }),
          job({
            title: "Barista",
            suitabilityScore: 40,
            stage: "screening",
            status: "in_progress",
          }),
          job({ title: "Data Analyst", suitabilityScore: 20 }),
        ],
      }),
    );
    expect(res.landing.applications).toBe(3);
    expect(res.landing.averageFit).toBe(50);
    expect(res.landing.best).toMatchObject({
      title: "Strategy Lead",
      score: 80,
    });
    expect(res.landing.lowFitSharePct).toBe(67);
    expect(res.landing.lowFitFamilies).toEqual(["Other"]);
  });

  it("is empty with no applications", () => {
    const res = computeProfileInsights(input({ jobs: [job()] }));
    expect(res.landing).toEqual({
      applications: 0,
      averageFit: null,
      best: null,
      lowFitSharePct: null,
      lowFitFamilies: [],
    });
  });
});

describe("strength checks", () => {
  describe("basics", () => {
    it("full marks with all parts and an aimed headline", () => {
      const c = checkOf(computeProfileInsights(input()), "basics");
      expect(c).toMatchObject({ points: 10, max: 10 });
      expect(c.fix).toBeUndefined();
    });

    it("2 per missing part, pointing to the resume", () => {
      const r = resume();
      r.basics = { ...r.basics, email: "", profiles: [] };
      const c = checkOf(computeProfileInsights(input({ resume: r })), "basics");
      expect(c.points).toBe(6);
      expect(c.action).toBe("edit-resume");
      expect(c.fix).toContain("email and LinkedIn");
    });

    it("needs the line to aim at a target role", () => {
      const r = resume();
      r.basics = { ...r.basics, headline: "Generalist" };
      const c = checkOf(computeProfileInsights(input({ resume: r })), "basics");
      expect(c).toMatchObject({ points: 8, action: "edit-brand" });
      const saved = computeProfileInsights(
        input({
          resume: r,
          entries: entries({
            brand: { line: "I make strategy happen", industries: [] },
          }),
        }),
      );
      expect(checkOf(saved, "basics").points).toBe(10);
      expect(saved.brand).toMatchObject({
        line: "I make strategy happen",
        lineSource: "saved",
      });
    });

    it("generic words alone do not count", () => {
      const r = resume();
      r.basics = { ...r.basics, headline: "Senior manager" };
      expect(
        checkOf(computeProfileInsights(input({ resume: r })), "basics").points,
      ).toBe(8);
    });

    it("scores 0 without a resume", () => {
      expect(
        checkOf(computeProfileInsights(input({ resume: null })), "basics")
          .points,
      ).toBe(0);
    });
  });

  describe("results", () => {
    const withExp = (experience: ProfileResumeInput["experience"]) =>
      checkOf(
        computeProfileInsights(input({ resume: resume({ experience }) })),
        "results",
      );

    it("scales with the share of bullets with a number", () => {
      const c = withExp([
        {
          position: "A",
          company: "X",
          period: "",
          description: ul(
            "Saved 10%",
            "Did things",
            "Led 2020 work",
            "3 hires",
          ),
        },
      ]);
      expect(c).toMatchObject({ points: 10, action: "edit-resume" });
      expect(c.fix).toContain("2 of 4");
    });

    it("lists roles with no bullets as gaps", () => {
      const c = withExp([
        {
          position: "A",
          company: "X",
          period: "",
          description: ul("Saved 10%"),
        },
        { position: "B", company: "Y", period: "", description: "" },
      ]);
      expect(c.points).toBe(20);
      expect(c.fix).toBeUndefined();
      const partial = withExp([
        {
          position: "A",
          company: "X",
          period: "",
          description: ul("Saved 10%", "x"),
        },
        { position: "B", company: "Y", period: "", description: "" },
      ]);
      expect(partial.points).toBe(10);
      expect(partial.fix).toContain("B at Y");
    });

    it("is 0 with no bullets", () => {
      expect(withExp([]).points).toBe(0);
    });
  });

  describe("proof", () => {
    it("0 with no best-fit jobs and no action", () => {
      const c = checkOf(computeProfileInsights(input()), "proof");
      expect(c.points).toBe(0);
      expect(c.action).toBeUndefined();
    });

    it("full when no skill reaches 40%", () => {
      const jobs = Array.from({ length: 5 }, () => job());
      expect(
        checkOf(computeProfileInsights(input({ jobs })), "proof").points,
      ).toBe(25);
    });

    it("averages capped proof over skills at 40%+", () => {
      // 2 of 5 jobs (40%) mention SQL, roadmap; proof SQL=3 (capped 2), roadmap=1.
      const jobs = [
        job({ description: `${LONG} SQL roadmap` }),
        job({ description: `${LONG} SQL roadmap` }),
        job({ description: `${LONG} pricing` }),
        job(),
        job(),
      ];
      const res = computeProfileInsights(
        input({
          jobs,
          resume: resume({
            experience: [
              {
                position: "A",
                company: "X",
                period: "",
                description: ul("Led roadmap"),
              },
            ],
          }),
          entries: entries({ stories: [story({ result: "SQL saved time" })] }),
        }),
      );
      const c = checkOf(res, "proof");
      // mean(min(3,2), 1) = 1.5 → 1.5/2*25 = 18.75 → 19
      expect(c.points).toBe(19);
      expect(c.fix).toContain("Roadmap & prioritization");
      expect(c.action).toBe("edit-resume");
    });
  });

  describe("stories", () => {
    const withThemes = (themes: Theme[][]) =>
      checkOf(
        computeProfileInsights(
          input({
            entries: entries({
              stories: themes.map((t) => story({ themes: t })),
            }),
          }),
        ),
        "stories",
      );

    it("gives 20/6 per covered theme", () => {
      expect(withThemes([]).points).toBe(0);
      expect(withThemes([["delivery"]]).points).toBe(3);
      expect(withThemes([["delivery", "analytics"], ["delivery"]]).points).toBe(
        7,
      );
      const c = withThemes([["delivery", "analytics", "customer"]]);
      expect(c).toMatchObject({ points: 10, action: "add-story" });
      expect(c.fix).toContain("leadership, influence and failure");
      expect(
        withThemes([
          [
            "delivery",
            "analytics",
            "customer",
            "leadership",
            "influence",
            "failure",
          ],
        ]).points,
      ).toBe(20);
    });
  });

  describe("pitch and values", () => {
    const pv = (over: Partial<ProfileInsightsInput["entries"]>) =>
      checkOf(
        computeProfileInsights(input({ entries: entries(over) })),
        "pitch-values",
      );
    const pitch = (s15: string, s30: string, s60: string) => ({
      s15,
      s30,
      s60,
      builtFrom: { storyIds: [], values: [] },
    });
    const values = (n: number) => ({
      items: Array.from({ length: n }, (_, i) => ({
        label: `v${i}`,
        starred: false,
      })),
      ideal: { size: 50, management: 50, office: 50 },
    });

    it("scores each part", () => {
      expect(pv({}).points).toBe(0);
      expect(pv({}).action).toBe("edit-pitch");
      const partial = pv({ pitch: pitch("a", " ", "c") });
      expect(partial.points).toBe(4);
      expect(partial.fix).toContain("30s");
      const noValues = pv({ pitch: pitch("a", "b", "c"), values: values(2) });
      expect(noValues).toMatchObject({ points: 8, action: "edit-values" });
      expect(
        pv({ pitch: pitch("a", "b", "c"), values: values(3) }).points,
      ).toBe(10);
    });
  });

  describe("fresh", () => {
    const fresh = (resumeDays: number | null, storyDays?: number) =>
      checkOf(
        computeProfileInsights(
          input({
            resumeUpdatedAt: resumeDays === null ? null : iso(resumeDays),
            entries: entries({
              stories:
                storyDays === undefined ? [] : [story({}, iso(storyDays))],
            }),
          }),
        ),
        "fresh",
      );

    it("steps at 60 and 120 days", () => {
      expect(fresh(60).points).toBe(15);
      expect(fresh(61).points).toBe(8);
      expect(fresh(120).points).toBe(8);
      expect(fresh(121)).toMatchObject({ points: 0, action: "edit-resume" });
      expect(fresh(null).points).toBe(0);
    });

    it("counts profile entry updates", () => {
      expect(fresh(200, 10).points).toBe(15);
      const res = computeProfileInsights(
        input({
          resumeUpdatedAt: iso(300),
          entries: entries({ singletonsUpdatedAt: iso(100) }),
        }),
      );
      expect(checkOf(res, "fresh").points).toBe(8);
    });
  });

  it("totals the checks", () => {
    const res = computeProfileInsights(input());
    expect(res.strength.max).toBe(100);
    expect(res.strength.total).toBe(
      res.strength.checks.reduce((s, c) => s + c.points, 0),
    );
    expect(res.strength.checks.map((c) => c.id)).toEqual([
      "basics",
      "results",
      "proof",
      "stories",
      "pitch-values",
      "fresh",
    ]);
  });
});

describe("data state", () => {
  it("no-resume without a resume", () => {
    const res = computeProfileInsights(
      input({ resume: null, jobs: Array.from({ length: 10 }, () => job()) }),
    );
    expect(res.dataState).toBe("no-resume");
    expect(res.brand).toMatchObject({
      initials: "",
      line: null,
      lineSource: "none",
    });
  });

  it("too-early under 5 scored jobs", () => {
    const four = Array.from({ length: 4 }, () => job());
    expect(
      computeProfileInsights(
        input({ jobs: [...four, job({ suitabilityScore: null })] }),
      ).dataState,
    ).toBe("too-early");
    expect(
      computeProfileInsights(input({ jobs: [...four, job()] })).dataState,
    ).toBe("ok");
  });
});

describe("brand, pitch, values and stories", () => {
  it("resolves pitch stories and drops missing ones", () => {
    const s = story({ title: "Claims rebuild" });
    const res = computeProfileInsights(
      input({
        entries: entries({
          stories: [s],
          pitch: {
            s15: "Hi",
            s30: "",
            s60: "",
            builtFrom: { storyIds: [s.id, "missing"], values: ["Craft"] },
          },
        }),
      }),
    );
    expect(res.pitch.builtFrom).toEqual({
      stories: [{ id: s.id, title: "Claims rebuild" }],
      values: ["Craft"],
    });
    expect(res.pitch.isEmpty).toBe(false);
    expect(computeProfileInsights(input()).pitch.isEmpty).toBe(true);
  });

  it("builds brand chips and initials", () => {
    const res = computeProfileInsights(
      input({
        searchTerms: [" Strategy Manager ", ""],
        entries: entries({ brand: { line: "", industries: ["Insurance"] } }),
      }),
    );
    expect(res.brand).toEqual({
      initials: "AE",
      line: "Strategy & operations leader",
      lineSource: "headline",
      targetRoles: ["Strategy Manager"],
      location: "Toronto, ON",
      industries: ["Insurance"],
    });
  });

  it("counts every theme and ranks top stories", () => {
    const a = story(
      { themes: ["delivery"], result: "long result here", metric: null },
      iso(1),
    );
    const b = story(
      { themes: ["delivery", "failure"], result: "short", metric: "20%" },
      iso(5),
    );
    const c = story(
      { themes: [], result: "long result here", metric: null },
      iso(0),
    );
    const d = story({ themes: [], result: "x", metric: null }, iso(0));
    const res = computeProfileInsights(
      input({ entries: entries({ stories: [a, b, c, d] }) }),
    );
    expect(res.stories.total).toBe(4);
    expect(res.stories.themes).toEqual([
      { theme: "delivery", count: 2 },
      { theme: "analytics", count: 0 },
      { theme: "customer", count: 0 },
      { theme: "leadership", count: 0 },
      { theme: "influence", count: 0 },
      { theme: "failure", count: 1 },
    ]);
    expect(res.stories.top.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  it("passes values through", () => {
    const values = {
      items: [{ label: "Craft", starred: true }],
      ideal: { size: 20, management: 40, office: 10 },
    };
    expect(
      computeProfileInsights(input({ entries: entries({ values }) })).values,
    ).toEqual(values);
    expect(computeProfileInsights(input()).values).toEqual({
      items: [],
      ideal: null,
    });
  });
});

describe("realistic strategy/ops profile", () => {
  const sunLife = ul(
    "Led cross-functional team of 12 to redesign group benefits claims intake, cutting turnaround 35%",
    "Built the 2024 operating plan and KPI dashboard used by senior leadership",
    "Prioritized a $4M transformation roadmap across 5 business units",
    "Partnered with stakeholders in IT and Finance to launch digital enrolment",
  );
  const owen = resume({
    basics: {
      name: "Owen Brown",
      headline: "Strategy & Operations leader in financial services",
      location: "Toronto, ON",
      email: "owen@example.com",
      profiles: [{ network: "LinkedIn", url: "https://www.linkedin.com/in/x" }],
    },
    summary: "<p>Operator who turns strategy into execution.</p>",
    experience: [
      {
        position: "Senior Manager, Strategy & Operations",
        company: "Sun Life",
        period: "2021 - Present",
        description: sunLife,
      },
      {
        position: "Consultant",
        company: "Advisory firm",
        period: "2018 - 2021",
        description: ul(
          "Built financial models for market sizing of new products",
          "Ran executive workshops",
        ),
      },
    ],
    skills: ["Stakeholder management", "SQL", "Agile"],
  });
  const desc = (extra: string) => `${LONG} ${extra}`;
  const jobs: ProfileJobRow[] = [
    ...Array.from({ length: 6 }, (_, i) =>
      job({
        title: "Manager, Strategy & Operations",
        suitabilityScore: 72 + i,
        description: desc(
          "Partner with cross-functional stakeholders, own KPIs, present to the executive team.",
        ),
      }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      job({
        title: "Senior Product Manager",
        suitabilityScore: 48 + i,
        description: desc(
          "Own the roadmap, run user research and A/B experiments, write user stories, partner with stakeholders.",
        ),
      }),
    ),
    job({
      title: "Business Operations Lead",
      suitabilityScore: 80,
      status: "applied",
      appliedAt: iso(5),
      stage: "interview",
      description: desc("Drive KPIs and the operating plan."),
    }),
    job({
      title: "Product Manager, Payments",
      suitabilityScore: 40,
      status: "applied",
      appliedAt: iso(9),
      stage: "applied",
      description: desc("Roadmap, SQL, A/B tests."),
    }),
  ];

  const res = computeProfileInsights(
    input({
      resume: owen,
      resumeUpdatedAt: iso(20),
      searchTerms: ["Strategy and Operations Manager", "Product Manager"],
      jobs,
      entries: entries({
        stories: [
          story({
            title: "Claims intake redesign",
            themes: ["delivery", "leadership"],
            action: "Aligned stakeholders across IT and operations",
            result: "Turnaround down 35%",
            metric: "35%",
          }),
        ],
      }),
    }),
  );

  it("reads as a strategy/ops core fit with a PM stretch", () => {
    expect(res.dataState).toBe("ok");
    expect(res.roles[0]).toMatchObject({
      familyId: "strategy-ops",
      tag: "Core fit",
      jobCount: 7,
      appliedCount: 1,
    });
    const pm = res.roles.find((r) => r.familyId === "product-manager");
    expect(pm?.tag).toBe("Stretch");
    expect(pm?.gap).toMatch(/Add proof of/);
  });

  it("matches Sun Life bullets to the right proof levels", () => {
    const proof = Object.fromEntries(res.skills.map((s) => [s.id, s.proof]));
    expect(proof["cross-functional"]).toBe(3); // story mentions stakeholders
    expect(proof.roadmap).toBe(2); // "Prioritized a $4M ... roadmap"
    expect(proof.kpis).toBe(1); // KPI bullet's only number is a year
    expect(proof["exec-comms"]).toBe(1); // "senior leadership" bullet has only a year
  });

  it("puts in-demand, proven skills in lead-with", () => {
    const cf = res.skills.find((s) => s.id === "cross-functional");
    expect(cf?.demandPct).toBeGreaterThanOrEqual(50);
    expect(cf?.quadrant).toBe("lead-with");
    const exp = res.skills.find((s) => s.id === "experimentation");
    expect(exp?.quadrant).toBe("nice-to-have");
  });

  it("scores strength sensibly", () => {
    expect(checkOf(res, "basics").points).toBe(10);
    // 2 of 6 bullets carry a non-year number.
    expect(checkOf(res, "results").points).toBe(7);
    expect(checkOf(res, "stories").points).toBe(7);
    expect(checkOf(res, "fresh").points).toBe(15);
    expect(res.landing).toMatchObject({ applications: 2, averageFit: 60 });
    expect(res.landing.best?.title).toBe("Business Operations Lead");
    expect(res.brand.initials).toBe("OB");
  });
});

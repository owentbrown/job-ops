import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import {
  evaluateRules,
  OCCASIONAL_PHRASES,
  WEEKLY_PATTERNS,
  WEEKLY_PHRASES,
} from "./rules";

const config = parsePrefilterConfig({
  title: {
    include: ["product manager", "growth"],
    exclude: ["analyst", "intern", "specialist", "court"],
  },
  companyBlocklist: ["staffing"],
  location: { commuteBlocklist: ["toronto"] },
  salary: { ratesToCad: { CAD: 1, USD: 1.37 } },
  description: {
    hardDropPhrases: ["commission-only"],
    flagPhrases: ["commission", "quota"],
  },
});

function job(overrides: Parameters<typeof createJob>[0]) {
  return createJob({
    title: "Operations Lead",
    employer: "Acme",
    location: "Waterloo, ON",
    isRemote: null,
    workFromHomeType: null,
    salary: null,
    salaryMaxAmount: null,
    salaryInterval: null,
    salaryCurrency: null,
    jobDescription: "A role.",
    ...overrides,
  });
}

describe("evaluateRules", () => {
  it.each([
    ["Business Analyst", "analyst"],
    ["Summer Intern - Marketing", "intern"],
    ["Spare Parts Specialist", "specialist"],
    ["Criminal Court Victim Specialist", "specialist"],
  ])("drops '%s' on title keyword", (title, keyword) => {
    expect(evaluateRules(job({ title }), config)).toEqual({
      decision: "drop",
      reason: `title keyword '${keyword}'`,
    });
  });

  it("does not treat 'Internal' as 'intern'", () => {
    expect(
      evaluateRules(job({ title: "Internal Communications Manager" }), config)
        .decision,
    ).toBe("undecided");
  });

  it("keeps include hits even when an exclude also matches", () => {
    expect(evaluateRules(job({ title: "Growth Specialist" }), config)).toEqual({
      decision: "keep",
      reason: "title include 'growth'",
    });
    expect(
      evaluateRules(job({ title: "Senior Product Manager" }), config).decision,
    ).toBe("keep");
  });

  it("leaves unknown titles undecided for the LLM check", () => {
    expect(
      evaluateRules(job({ title: "Basketball Operations" }), config),
    ).toEqual({
      decision: "undecided",
      flags: [],
    });
  });

  it("drops blocklisted companies before title rules", () => {
    expect(
      evaluateRules(
        job({ title: "Product Manager", employer: "Acme Staffing Inc" }),
        config,
      ),
    ).toEqual({
      decision: "drop",
      reason: "company blocklist 'staffing'",
    });
  });

  it("does not drop a commute city when the description says fully remote", () => {
    expect(
      evaluateRules(
        job({
          location: "Toronto, ON",
          jobDescription: "<p>We are a <b>fully remote</b> team</p>",
        }),
        config,
      ),
    ).toEqual({
      decision: "undecided",
      flags: ["commute: toronto (remote/occasional travel?)"],
    });
    expect(
      evaluateRules(
        job({ location: "Toronto, ON", jobDescription: "On site daily." }),
        config,
      ).decision,
    ).toBe("drop");
  });

  it("drops non-remote Toronto jobs but keeps remote ones", () => {
    expect(evaluateRules(job({ location: "Toronto, ON" }), config)).toEqual({
      decision: "drop",
      reason: "location 'toronto' needs a commute (no remote signal)",
    });
    expect(
      evaluateRules(job({ location: "Toronto, ON", isRemote: true }), config)
        .decision,
    ).toBe("undecided");
    expect(
      evaluateRules(job({ location: "Remote - Toronto, ON" }), config).decision,
    ).toBe("undecided");
  });

  it("drops on salary below the floor and never on missing salary", () => {
    const dropped = evaluateRules(
      job({ title: "Product Manager", salary: "$45/hr" }),
      config,
    );
    expect(dropped.decision).toBe("drop");
    expect(dropped.decision === "drop" && dropped.reason).toMatch(
      /^salary max/,
    );
    expect(
      evaluateRules(job({ title: "Product Manager" }), config).decision,
    ).toBe("keep");
  });

  it("drops hard-drop description phrases", () => {
    expect(
      evaluateRules(
        job({ jobDescription: "<p>This is a commission-only role.</p>" }),
        config,
      ),
    ).toEqual({ decision: "drop", reason: "description: 'commission-only'" });
  });

  it("passes flag phrases to the LLM instead of dropping", () => {
    expect(
      evaluateRules(
        job({ jobDescription: "Base plus commission. Quota applies." }),
        config,
      ),
    ).toEqual({
      decision: "undecided",
      flags: ["commission", "quota"],
    });
  });

  it("does not drop on a negated hard-drop phrase", () => {
    const outcome = evaluateRules(
      job({ jobDescription: "This is not a commission-only role." }),
      config,
    );
    expect(outcome.decision).toBe("undecided");
    expect(outcome.decision === "undecided" && outcome.flags).toContain(
      "commission-only",
    );
    expect(
      evaluateRules(
        job({
          jobDescription: "Not for everyone. This is a commission-only role.",
        }),
        config,
      ).decision,
    ).toBe("drop");
  });

  it("does not drop multi-location jobs on the commute list", () => {
    expect(
      evaluateRules(job({ location: "Waterloo or Toronto" }), config),
    ).toEqual({
      decision: "undecided",
      flags: ["commute: toronto"],
    });
    expect(
      evaluateRules(job({ location: "Toronto, ON" }), config).decision,
    ).toBe("drop");
  });

  describe("commute weekly vs occasional", () => {
    const toronto = (description: string, extra = {}) =>
      evaluateRules(
        job({ location: "Toronto, ON", jobDescription: description, ...extra }),
        config,
      );

    it("drops hybrid / N days a week roles", () => {
      expect(toronto("Hybrid, 3 days a week in office")).toEqual({
        decision: "drop",
        reason: "location 'toronto': weekly in-office (3 days a week)",
      });
      expect(toronto("Be in the office 3 days a week.")).toMatchObject({
        decision: "drop",
        reason: "location 'toronto': weekly in-office (3 days a week)",
      });
    });

    it("lets weekly win over remote signals", () => {
      expect(
        toronto("We are remote-first, 2 days per week in office"),
      ).toMatchObject({ decision: "drop" });
    });

    it("sends remote roles with occasional travel to the AI check", () => {
      expect(
        toronto("This is a remote role with quarterly team meetups in Toronto"),
      ).toEqual({
        decision: "undecided",
        flags: ["commute: toronto (remote/occasional travel?)"],
      });
    });

    it("drops with no remote signal", () => {
      expect(toronto("A plain description.")).toEqual({
        decision: "drop",
        reason: "location 'toronto' needs a commute (no remote signal)",
      });
    });

    it("drops when workFromHomeType or location says hybrid or on-site", () => {
      expect(toronto("Great role.", { workFromHomeType: "Hybrid" })).toEqual({
        decision: "drop",
        reason: "location 'toronto': weekly in-office (hybrid)",
      });
      expect(
        evaluateRules(
          job({ location: "Toronto, ON (On-site)", jobDescription: "x" }),
          config,
        ),
      ).toMatchObject({ decision: "drop" });
    });

    it("ignores negated weekly phrases", () => {
      expect(toronto("No hybrid requirement, fully remote")).toEqual({
        decision: "undecided",
        flags: ["commute: toronto (remote/occasional travel?)"],
      });
      expect(
        toronto("Not required to be in office 3 days a week. Remote role."),
      ).toMatchObject({ decision: "undecided" });
    });

    it("treats bare hybrid as a weak signal", () => {
      expect(toronto("We offer hybrid and remote options")).toEqual({
        decision: "undecided",
        flags: ["commute: toronto (hybrid or remote?)"],
      });
      expect(toronto("Our hybrid cloud platform team")).toEqual({
        decision: "drop",
        reason: "location 'toronto' needs a commute (no remote signal)",
      });
      expect(
        evaluateRules(
          job({ location: "Hybrid - Toronto", jobDescription: "A role." }),
          config,
        ),
      ).toEqual({
        decision: "drop",
        reason: "location 'toronto': weekly in-office (hybrid)",
      });
    });

    it("drops fully on-site roles", () => {
      expect(toronto("This is a fully on-site position")).toMatchObject({
        decision: "drop",
      });
    });

    it("drops multi-location when weekly and all places are commute cities", () => {
      const multi = (location: string, description: string) =>
        evaluateRules(job({ location, jobDescription: description }), config);
      expect(multi("Toronto or Toronto, ON", "Hybrid role")).toMatchObject({
        decision: "drop",
      });
      expect(multi("Waterloo or Toronto", "Hybrid role")).toEqual({
        decision: "undecided",
        flags: ["commute: toronto"],
      });
    });

    it("does not touch remote-flagged or non-commute jobs", () => {
      expect(toronto("Hybrid 3 days a week", { isRemote: true }).decision).toBe(
        "undecided",
      );
      expect(
        evaluateRules(
          job({
            location: "Waterloo, ON",
            jobDescription: "Hybrid, 3 days a week",
          }),
          config,
        ).decision,
      ).toBe("undecided");
    });

    it("exports phrase constants", () => {
      expect(WEEKLY_PHRASES).toContain("fully on-site");
      expect(OCCASIONAL_PHRASES).toContain("quarterly");
      expect(OCCASIONAL_PHRASES).toContain("remote role");
      expect(WEEKLY_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  it("treats a '| Hybrid' work-model suffix as one place, not two", () => {
    const outcome = evaluateRules(
      job({
        location: "Toronto, Canada | Hybrid",
        jobDescription: "Hybrid work model with in-office days.",
      }),
      config,
    );
    expect(outcome).toEqual({
      decision: "drop",
      reason: "location 'toronto': weekly in-office (hybrid)",
    });
  });
});

describe("max posting age", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const aged = parsePrefilterConfig({ maxPostingAgeDays: 21 });

  it("drops jobs posted longer ago than the limit", () => {
    const outcome = evaluateRules(
      job({ title: "Product Manager", datePosted: "2026-09-08T00:00:00.000Z" }),
      aged,
      now,
    );
    expect(outcome).toEqual({
      decision: "drop",
      reason: "posted 63 days ago (limit 21)",
    });
  });

  it("keeps jobs on or inside the limit", () => {
    const outcome = evaluateRules(
      job({ title: "Product Manager", datePosted: "2026-10-20T12:00:00Z" }),
      aged,
      now,
    );
    expect(outcome.decision).not.toBe("drop");
  });

  it("lets jobs with no or unreadable dates through", () => {
    for (const datePosted of [null, "", "sometime last month"]) {
      const outcome = evaluateRules(
        job({ title: "Product Manager", datePosted }),
        aged,
        now,
      );
      expect(outcome.decision).not.toBe("drop");
    }
  });

  it("has no limit by default", () => {
    const outcome = evaluateRules(
      job({ title: "Product Manager", datePosted: "2025-01-01" }),
      config,
      now,
    );
    expect(outcome.decision).not.toBe("drop");
  });
});

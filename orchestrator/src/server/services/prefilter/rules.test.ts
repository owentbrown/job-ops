import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { evaluateRules } from "./rules";

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
      flags: ["commute: toronto (description says remote)"],
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
      reason: "location 'toronto' needs a commute (not remote)",
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
});

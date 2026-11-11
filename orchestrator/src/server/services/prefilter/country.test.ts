import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { isUsOnlyLocation } from "./country";
import { evaluateRules, US_LISTED_FLAG } from "./rules";

const config = parsePrefilterConfig({
  title: { include: ["product manager"], exclude: ["analyst"] },
  location: { commuteBlocklist: ["toronto"] },
  companyNotes: [
    { company: "Float", note: "hybrid, 3 days a week in the Toronto office" },
  ],
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

describe("isUsOnlyLocation", () => {
  it.each([
    "Chicago, Illinois, U.S. | Remote",
    "Iowa, U.S. | Remote",
    "Columbus, Ohio, U.S. | Remote",
    "Austin, TX",
    "Remote - US",
    "United States",
    "New York, NY",
  ])("treats %s as US-only", (location) => {
    expect(isUsOnlyLocation(location)).toBe(true);
  });

  it.each([
    "Waterloo or Boston or United States or Canada",
    "San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States",
    "United States or Mississauga",
    "Remote - North America",
    "Toronto, Canada | Hybrid",
    "Kitchener, ON",
    "Remote",
    "London, UK",
    "San Francisco, CA, Toronto",
    null,
  ])("does not treat %s as US-only", (location) => {
    expect(isUsOnlyLocation(location)).toBe(false);
  });
});

describe("US-only rule", () => {
  it("drops a US-only listing that never mentions Canada", () => {
    const outcome = evaluateRules(
      job({
        title: "Product Manager",
        location: "Chicago, Illinois, U.S. | Remote",
        jobDescription: "Join our remote team.",
      }),
      config,
    );
    expect(outcome).toEqual({
      decision: "drop",
      reason: "US-only location (no mention of Canada)",
    });
  });

  it("sends a US listing that mentions Canada to the AI check, even with an include title", () => {
    const outcome = evaluateRules(
      job({
        title: "Product Manager",
        location: "Chicago, Illinois, U.S. | Remote",
        jobDescription: "Remote anywhere in the US or Canada.",
      }),
      config,
    );
    expect(outcome.decision).toBe("undecided");
    if (outcome.decision === "undecided") {
      expect(outcome.flags).toContain(US_LISTED_FLAG);
    }
  });

  it("keeps listings that include Canada", () => {
    const outcome = evaluateRules(
      job({
        title: "Product Manager",
        location: "United States or Canada or Waterloo",
      }),
      config,
    );
    expect(outcome.decision).toBe("keep");
  });

  it("drops a US residency requirement when nothing points to Canada", () => {
    const outcome = evaluateRules(
      job({
        location: "Remote",
        jobDescription: "You must reside in the United States.",
      }),
      config,
    );
    expect(outcome).toEqual({
      decision: "drop",
      reason: "description: 'must reside in the united states'",
    });
  });

  it("only flags US authorization boilerplate on a Canadian job", () => {
    const outcome = evaluateRules(
      job({
        location: "Waterloo, ON",
        jobDescription:
          "Applicants must be authorized to work in the U.S. or locally.",
      }),
      config,
    );
    expect(outcome.decision).toBe("undecided");
  });

  it("can be turned off", () => {
    const off = parsePrefilterConfig({
      location: { commuteBlocklist: [], dropUsOnly: false },
    });
    const outcome = evaluateRules(
      job({ location: "Austin, TX", jobDescription: "Office role." }),
      off,
    );
    expect(outcome.decision).toBe("undecided");
  });
});

describe("company notes", () => {
  it("sends the company's jobs to the AI check with the note, even with an include title", () => {
    const outcome = evaluateRules(
      job({
        title: "Product Manager",
        employer: "Float",
        location: "Canada | Remote",
      }),
      config,
    );
    expect(outcome.decision).toBe("undecided");
    if (outcome.decision === "undecided") {
      expect(outcome.flags).toContain(
        "company note (Float): hybrid, 3 days a week in the Toronto office",
      );
    }
  });

  it("matches the company name run together (Floatfinancial)", () => {
    const outcome = evaluateRules(
      job({ title: "Product Manager", employer: "Floatfinancial" }),
      config,
    );
    expect(outcome.decision).toBe("undecided");
  });

  it("does not affect other companies", () => {
    const outcome = evaluateRules(
      job({ title: "Product Manager", employer: "Acme" }),
      config,
    );
    expect(outcome.decision).toBe("keep");
  });
});

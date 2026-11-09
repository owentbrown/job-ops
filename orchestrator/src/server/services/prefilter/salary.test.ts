import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { evaluateSalary, parseSalaryText } from "./salary";

const salaryConfig = parsePrefilterConfig({
  salary: { ratesToCad: { CAD: 1, USD: 1.37 } },
}).salary;

function job(overrides: Parameters<typeof createJob>[0]) {
  return createJob({
    salary: null,
    salaryMaxAmount: null,
    salaryInterval: null,
    salaryCurrency: null,
    location: null,
    ...overrides,
  });
}

describe("parseSalaryText", () => {
  it("parses hourly", () => {
    expect(parseSalaryText("$30 - $45 an hour")).toEqual({
      max: 45,
      interval: "hourly",
      currency: null,
    });
  });
  it("parses yearly ranges with commas", () => {
    expect(parseSalaryText("$90,000 - $120,000 a year")).toEqual({
      max: 120000,
      interval: "yearly",
      currency: null,
    });
  });
  it("parses K shorthand and explicit currency", () => {
    expect(parseSalaryText("CA$95K–105K")).toEqual({
      max: 105000,
      interval: null,
      currency: "CAD",
    });
    expect(parseSalaryText("US$45/hr")).toEqual({
      max: 45,
      interval: "hourly",
      currency: "USD",
    });
  });
  it("returns null for text without a currency marker", () => {
    expect(parseSalaryText("Competitive")).toBeNull();
    expect(parseSalaryText("401k matching")).toBeNull();
  });
});

describe("evaluateSalary", () => {
  it("drops $45/hr in Ontario (93.6K CAD)", () => {
    const result = evaluateSalary(
      job({ salary: "$45/hr", location: "Waterloo, ON" }),
      salaryConfig,
    );
    expect(result.belowFloor).toBe(true);
    expect(result.annualMaxCad).toBe(93600);
  });

  it("defaults to CAD when currency and country are unknown", () => {
    expect(
      evaluateSalary(job({ salary: "$45/hr" }), salaryConfig).belowFloor,
    ).toBe(true);
  });

  it("keeps US$45/hr (~128K CAD)", () => {
    const result = evaluateSalary(job({ salary: "US$45/hr" }), salaryConfig);
    expect(result.belowFloor).toBe(false);
  });

  it("infers USD from a US location", () => {
    const result = evaluateSalary(
      job({
        salaryMaxAmount: 100000,
        salaryInterval: "yearly",
        location: "Austin, TX, United States",
      }),
      salaryConfig,
    );
    expect(result.annualMaxCad).toBe(137000);
    expect(result.belowFloor).toBe(false);
  });

  it("drops a structured CAD max below the floor", () => {
    const result = evaluateSalary(
      job({
        salaryMaxAmount: 95000,
        salaryInterval: "yearly",
        salaryCurrency: "CAD",
      }),
      salaryConfig,
    );
    expect(result.belowFloor).toBe(true);
  });

  it("never drops when salary is missing or ambiguous", () => {
    expect(evaluateSalary(job({}), salaryConfig).belowFloor).toBe(false);
    expect(
      evaluateSalary(job({ salary: "$500" }), salaryConfig).belowFloor,
    ).toBe(false);
    expect(
      evaluateSalary(
        job({
          salaryMaxAmount: 50000,
          salaryCurrency: "JPY",
          salaryInterval: "yearly",
        }),
        salaryConfig,
      ).belowFloor,
    ).toBe(false);
  });

  it("does nothing when salary checks are disabled", () => {
    const disabled = { ...salaryConfig, enabled: false };
    expect(evaluateSalary(job({ salary: "$20/hr" }), disabled).belowFloor).toBe(
      false,
    );
  });
});

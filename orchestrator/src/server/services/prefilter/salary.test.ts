import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { evaluateSalary, isClearlyCanadian, parseSalaryText } from "./salary";

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

  it("uses the most generous rate when currency and country are unknown", () => {
    const result = evaluateSalary(job({ salary: "$45/hr" }), salaryConfig);
    expect(result.belowFloor).toBe(false);
    expect(result.annualMaxCad).toBe(128232);
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

describe("evaluateSalary false-drop guards", () => {
  const drops = (overrides: Parameters<typeof job>[0]) =>
    evaluateSalary(job(overrides), salaryConfig).belowFloor;

  it("does not drop US or ambiguous locations on the CAD rate", () => {
    expect(
      drops({ salary: "$100,000 - $105,000", location: "New York, NY" }),
    ).toBe(false);
    expect(
      drops({
        salary: "$100,000 - $105,000",
        location: "Chicago, IL (on-site)",
      }),
    ).toBe(false);
    expect(
      drops({ salary: "$100,000 - $105,000", location: "Ontario, CA" }),
    ).toBe(false);
  });

  it("treats clearly Canadian locations as CAD", () => {
    expect(
      drops({
        salary: "$100,000 - $105,000",
        location: "Kitchener, ON, Canada",
      }),
    ).toBe(true);
    expect(
      drops({ salary: "$100,000 - $105,000", location: "Waterloo, ON" }),
    ).toBe(true);
  });

  it("never drops open-ended salaries", () => {
    expect(drops({ salary: "$90,000+", location: "Waterloo, ON" })).toBe(false);
    expect(drops({ salary: "From $90k", location: "Waterloo, ON" })).toBe(
      false,
    );
    expect(drops({ salary: "Minimum $80,000", location: "Waterloo, ON" })).toBe(
      false,
    );
    expect(
      drops({ salary: "$80,000 plus commission", location: "Waterloo, ON" }),
    ).toBe(false);
    expect(drops({ salary: "Up to $95K", location: "Waterloo, ON" })).toBe(
      true,
    );
    expect(
      drops({ salary: "$80,000+ - $95,000", location: "Waterloo, ON" }),
    ).toBe(true);
  });

  it("parses k and m suffixes and ignores unknown suffixes", () => {
    expect(parseSalaryText("$1.2M")?.max).toBe(1200000);
    expect(drops({ salary: "$1.2M", location: "Waterloo, ON" })).toBe(false);
    expect(parseSalaryText("$5x")).toBeNull();
    expect(parseSalaryText("$5 million")).toBeNull();
  });

  it("makes no decision for an ambiguous unknown interval", () => {
    expect(
      drops({
        salaryMaxAmount: 12000,
        salaryInterval: null,
        salaryCurrency: "CAD",
      }),
    ).toBe(false);
    expect(
      drops({
        salaryMaxAmount: 29000,
        salaryInterval: null,
        salaryCurrency: "CAD",
      }),
    ).toBe(false);
    expect(
      drops({
        salaryMaxAmount: 95000,
        salaryInterval: null,
        salaryCurrency: "CAD",
      }),
    ).toBe(true);
  });

  it("handles semi-monthly and bi-weekly intervals", () => {
    const semi = evaluateSalary(
      job({ salary: "$5,000 semi-monthly" }),
      salaryConfig,
    );
    expect(semi.annualMaxCad).toBe(5000 * 24 * 1.37);
    expect(semi.belowFloor).toBe(false);
    const structured = evaluateSalary(
      job({
        salaryMaxAmount: 4000,
        salaryInterval: "bi-weekly",
        salaryCurrency: "CAD",
      }),
      salaryConfig,
    );
    expect(structured.annualMaxCad).toBe(104000);
    expect(structured.belowFloor).toBe(true);
    expect(
      evaluateSalary(
        job({
          salaryMaxAmount: 4000,
          salaryInterval: "semimonthly",
          salaryCurrency: "CAD",
        }),
        salaryConfig,
      ).annualMaxCad,
    ).toBe(96000);
  });

  it("falls back to salary text for missing interval and currency", () => {
    const result = evaluateSalary(
      job({ salaryMaxAmount: 45, salary: "US$40 - 45 per hour" }),
      salaryConfig,
    );
    expect(result.annualMaxCad).toBe(Math.round(45 * 2080 * 1.37));
    expect(result.belowFloor).toBe(false);
  });

  it("never drops on million or billion amounts", () => {
    expect(parseSalaryText("$1.2 million")).toBeNull();
    expect(parseSalaryText("$2.5 billion")).toBeNull();
    expect(parseSalaryText("$1.2M")?.max).toBe(1200000);
    expect(parseSalaryText("$1.2x")).toBeNull();
    expect(drops({ salary: "$1.2 million", location: "Waterloo, ON" })).toBe(
      false,
    );
    expect(drops({ salary: "$2.5 billion", location: "Waterloo, ON" })).toBe(
      false,
    );
  });

  it("does not treat Canada-or-US locations as clearly Canadian", () => {
    expect(isClearlyCanadian("Remote - Canada or US")).toBe(false);
    expect(isClearlyCanadian("Canada / US")).toBe(false);
    expect(isClearlyCanadian("Canada (US)")).toBe(false);
    expect(isClearlyCanadian("Kitchener, ON, Canada")).toBe(true);
    expect(drops({ salary: "$100k", location: "Remote - Canada or US" })).toBe(
      false,
    );
  });
});

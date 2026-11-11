import { describe, expect, it } from "vitest";
import { formatUsd, matchesJobFilter, periodStart } from "./format";

describe("formatUsd", () => {
  it("keeps precision for fractions of a cent", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.00042)).toBe("$0.0004");
    expect(formatUsd(0.00001)).toBe("<$0.0001");
    expect(formatUsd(0.123)).toBe("$0.12");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });
});

describe("periodStart", () => {
  const now = new Date(2026, 10, 11, 15, 30);

  it("starts today at local midnight", () => {
    expect(periodStart("today", now)).toBe(
      new Date(2026, 10, 11).toISOString(),
    );
  });

  it("covers 7 days including today", () => {
    expect(periodStart("7d", now)).toBe(new Date(2026, 10, 5).toISOString());
  });

  it("starts the month on the 1st", () => {
    expect(periodStart("month", now)).toBe(new Date(2026, 10, 1).toISOString());
  });

  it("has no start for all time", () => {
    expect(periodStart("all", now)).toBeNull();
  });
});

describe("matchesJobFilter", () => {
  it("groups applied and in-progress together", () => {
    expect(matchesJobFilter("applied", "applied")).toBe(true);
    expect(matchesJobFilter("in_progress", "applied")).toBe(true);
    expect(matchesJobFilter("ready", "applied")).toBe(false);
    expect(matchesJobFilter(null, "all")).toBe(true);
    expect(matchesJobFilter(null, "applied")).toBe(false);
  });
});

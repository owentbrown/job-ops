import type { IndeedCompanyRow } from "@server/repositories/company-checks";
import { describe, expect, it } from "vitest";
import { buildReviewLinks, pickIndeedFacts, safeHttpUrl } from "./company-info";

const row = (overrides: Partial<IndeedCompanyRow>): IndeedCompanyRow => ({
  employer: "RBC",
  companyRating: 3.9,
  companyReviewsCount: 5475,
  employerUrl: "https://ca.indeed.com/cmp/Rbc",
  companyUrlDirect: "http://www.rbc.com",
  companyNumEmployees: "10,000+",
  companyIndustry: "Banking",
  discoveredAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});

describe("pickIndeedFacts", () => {
  it("borrows the Indeed rating from a saved listing at the same company", () => {
    expect(pickIndeedFacts("RBC Inc.", [row({})])).toEqual({
      rating: 3.9,
      reviewsCount: 5475,
      indeedUrl: "https://ca.indeed.com/cmp/Rbc",
      website: "http://www.rbc.com/",
      employees: "10,000+",
      industry: "Banking",
    });
  });

  it("prefers the rating based on the most reviews", () => {
    const facts = pickIndeedFacts("RBC", [
      row({ companyRating: 4.2, companyReviewsCount: 12 }),
      row({ companyRating: 3.8, companyReviewsCount: 6000 }),
    ]);
    expect(facts?.rating).toBe(3.8);
  });

  it("returns null for other companies or a blank employer", () => {
    expect(pickIndeedFacts("Kinaxis", [row({})])).toBeNull();
    expect(pickIndeedFacts("", [row({ employer: "" })])).toBeNull();
  });

  it("drops a company link that is not an Indeed page", () => {
    const facts = pickIndeedFacts("RBC", [
      row({ employerUrl: "https://ca.linkedin.com/company/rbc" }),
    ]);
    expect(facts?.indeedUrl).toBeNull();
  });
});

describe("buildReviewLinks", () => {
  it("links to the Indeed reviews page when known", () => {
    const links = buildReviewLinks("RBC", {
      rating: 3.9,
      reviewsCount: 1,
      indeedUrl: "https://ca.indeed.com/cmp/Rbc",
      website: null,
      employees: null,
      industry: null,
    });
    expect(links.find((l) => l.label === "Indeed")?.url).toBe(
      "https://ca.indeed.com/cmp/Rbc/reviews",
    );
  });

  it("falls back to search links and encodes the name", () => {
    const links = buildReviewLinks("AT&T Canada", null);
    expect(links.map((l) => l.label)).toEqual([
      "Glassdoor",
      "Indeed",
      "Blind",
      "Reddit",
      "News",
    ]);
    expect(links[0]?.url).toContain("keyword=AT%26T%20Canada");
    for (const link of links) expect(link.url).toMatch(/^https:\/\//);
  });
});

describe("safeHttpUrl", () => {
  it("keeps http(s), adds a scheme to bare domains, rejects the rest", () => {
    expect(safeHttpUrl("tailscale.com")).toBe("https://tailscale.com/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});

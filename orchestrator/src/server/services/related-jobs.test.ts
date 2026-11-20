import { describe, expect, it } from "vitest";
import { findRelatedJobs } from "./related-jobs";

type Row = Parameters<typeof findRelatedJobs>[1][number];

const row = (overrides: Partial<Row> & Pick<Row, "id">): Row => ({
  title: "Product Manager",
  employer: "Tailscale",
  jobUrl: `https://example.com/${overrides.id}`,
  status: "discovered",
  outcome: null,
  appliedAt: null,
  discoveredAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});

describe("findRelatedJobs", () => {
  const current = row({
    id: "current",
    title: "Senior Business Operations & Strategy Manager",
    employer: "tailscale",
    jobUrl:
      "https://job-boards.greenhouse.io/tailscale/jobs/4756307005?utm_source=freehire",
  });

  it("lists other jobs at the same company, ignoring case and legal endings", () => {
    const items = findRelatedJobs(current, [
      current,
      row({ id: "a", employer: "Tailscale Inc." }),
      row({ id: "b", employer: "TAILSCALE" }),
      row({ id: "other", employer: "Kinaxis" }),
    ]);
    expect(items.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("puts the same posting first, then applied jobs, newest first", () => {
    const items = findRelatedJobs(current, [
      row({
        id: "skipped-new",
        status: "skipped",
        discoveredAt: "2026-11-18T12:00:00.000Z",
      }),
      row({
        id: "applied-old",
        status: "applied",
        appliedAt: "2026-10-01T12:00:00.000Z",
      }),
      row({
        id: "applied-new",
        status: "applied",
        appliedAt: "2026-11-15T12:00:00.000Z",
      }),
      row({
        id: "same-posting",
        employer: "Tailscale (via a job board)",
        status: "skipped",
        jobUrl: "https://job-boards.greenhouse.io/tailscale/jobs/4756307005",
      }),
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "same-posting",
      "applied-new",
      "applied-old",
      "skipped-new",
    ]);
    expect(items[0]?.samePosting).toBe(true);
    expect(items[1]?.samePosting).toBe(false);
  });

  it("scores title similarity", () => {
    const [match] = findRelatedJobs(current, [
      row({ id: "a", title: "Business Operations & Strategy Manager" }),
    ]);
    expect(match?.titleSimilarity).toBeGreaterThan(70);
    expect(match?.titleSimilarity).toBeLessThan(100);
  });

  it("does not match jobs with a blank employer to each other", () => {
    const blank = row({ id: "blank", employer: "" });
    expect(findRelatedJobs(blank, [row({ id: "x", employer: "" })])).toEqual(
      [],
    );
  });

  it("caps the list", () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ id: `j${i}` }));
    expect(findRelatedJobs(current, many, 3)).toHaveLength(3);
  });
});

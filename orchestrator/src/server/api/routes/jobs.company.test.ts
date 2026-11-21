import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const runCompanyCheck = vi.fn();
const getCompanyCheckUnavailableReason = vi.fn();

vi.mock("@server/services/company-check", () => ({
  runCompanyCheck: (...args: unknown[]) => runCompanyCheck(...args),
  getCompanyCheckUnavailableReason: () => getCompanyCheckUnavailableReason(),
}));

describe.sequential("Company routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    runCompanyCheck.mockReset();
    getCompanyCheckUnavailableReason.mockReset().mockResolvedValue(null);
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function seed() {
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const indeedJob = await createJob({
      source: "indeed",
      title: "Product Manager",
      employer: "RBC",
      jobUrl: "https://ca.indeed.com/viewjob?jk=abc",
    });
    await updateJob(indeedJob.id, {
      companyRating: 3.9,
      companyReviewsCount: 5475,
      employerUrl: "https://ca.indeed.com/cmp/Rbc",
    } as never);
    return createJob({
      source: "linkedin",
      title: "Product Operations Manager",
      employer: "RBC Inc.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
    });
  }

  it("returns the Indeed rating from another listing and review links", async () => {
    const job = await seed();
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/company`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.indeed).toMatchObject({ rating: 3.9, reviewsCount: 5475 });
    expect(body.data.links[1]).toEqual({
      label: "Indeed",
      url: "https://ca.indeed.com/cmp/Rbc/reviews",
    });
    expect(body.data.check).toBeNull();
    expect(runCompanyCheck).not.toHaveBeenCalled();
  });

  it("runs a check once and serves it from the cache afterwards", async () => {
    const job = await seed();
    runCompanyCheck.mockResolvedValue({
      ok: true,
      check: {
        employer: "RBC Inc.",
        summary: "Large bank.",
        ratings: [],
        pros: ["Stable"],
        cons: [],
        redFlags: [],
        sources: [],
        checkedAt: "2026-11-20T12:00:00.000Z",
        model: "claude-haiku-5-5",
        searches: 3,
        costUsd: 0.033,
      },
    });

    const post = await fetch(`${baseUrl}/api/jobs/${job.id}/company/check`, {
      method: "POST",
    });
    const posted = await post.json();
    expect(post.status).toBe(200);
    expect(posted.data.check.summary).toBe("Large bank.");
    expect(runCompanyCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        employer: "RBC Inc.",
        jobTitle: "Product Operations Manager",
      }),
    );

    // Another job at the same company reuses the cached check.
    const { createJob } = await import("@server/repositories/jobs");
    const sibling = await createJob({
      source: "manual",
      title: "Analyst",
      employer: "RBC",
      jobUrl: "https://example.com/rbc-analyst",
    });
    const get = await fetch(`${baseUrl}/api/jobs/${sibling.id}/company`);
    const body = await get.json();
    expect(body.data.check.summary).toBe("Large bank.");
    expect(runCompanyCheck).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with the reason when checks are unavailable", async () => {
    const job = await seed();
    getCompanyCheckUnavailableReason.mockResolvedValue(
      "Company check needs Anthropic.",
    );
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/company/check`, {
      method: "POST",
    });
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error.message).toBe("Company check needs Anthropic.");
    expect(runCompanyCheck).not.toHaveBeenCalled();
  });

  it("returns 502 when the check fails", async () => {
    const job = await seed();
    runCompanyCheck.mockResolvedValue({ ok: false, error: "boom" });
    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/company/check`, {
      method: "POST",
    });
    expect(res.status).toBe(502);
  });
});

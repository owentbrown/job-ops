import * as jobsRepo from "@server/repositories/jobs";
import { createJob } from "@shared/testing/factories.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readHiringCafeBrowserPage } from "./hiring-cafe-browser";
import {
  backfillHiringCafeDescriptions,
  needsFullHiringCafeDescription,
  refreshHiringCafeDescription,
} from "./hiring-cafe-descriptions";

vi.mock("@server/repositories/jobs");
vi.mock("./hiring-cafe-browser", () => ({
  readHiringCafeBrowserPage: vi.fn(),
}));
vi.mock("./auto-pdf-regeneration", () => ({
  enqueueAutoPdfRegenerationForJob: vi.fn(),
}));
vi.mock("@server/tenancy/private-scope", () => ({
  getPrivateDataScope: () => ({ scopeKey: "test" }),
  getPrivateCloudflareCookieStorageDir: () => "/tmp/cookies",
}));

const FULL = `Full description. ${"Responsibilities and requirements. ".repeat(40)}`;

function detailPage(description: string | null) {
  const data = {
    props: {
      pageProps: { job: { job_information: { description } } },
    },
  };
  return {
    status: 200,
    challenged: false,
    html: `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`,
  };
}

const summaryJob = (overrides: Parameters<typeof createJob>[0] = {}) =>
  createJob({
    source: "hiringcafe",
    sourceJobId: "ashby___jobber___abc",
    jobDescription: "5+ years in customer success; B2B SaaS.",
    status: "applied",
    ...overrides,
  });

describe("Hiring Cafe full descriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jobsRepo.updateJob).mockResolvedValue(null);
  });

  it("only targets Hiring Cafe jobs saved with a short summary", () => {
    expect(needsFullHiringCafeDescription(summaryJob())).toBe(true);
    expect(
      needsFullHiringCafeDescription(summaryJob({ jobDescription: FULL })),
    ).toBe(false);
    expect(
      needsFullHiringCafeDescription(summaryJob({ source: "indeed" })),
    ).toBe(false);
  });

  it("saves the full description from the job's Hiring Cafe page", async () => {
    vi.mocked(readHiringCafeBrowserPage).mockResolvedValue(detailPage(FULL));
    const job = summaryJob();

    await expect(refreshHiringCafeDescription(job)).resolves.toBe("updated");
    expect(readHiringCafeBrowserPage).toHaveBeenCalledWith(
      "test",
      "/tmp/cookies",
      "https://hiringcafe.com/job/ashby___jobber___abc",
    );
    expect(jobsRepo.updateJob).toHaveBeenCalledWith(job.id, {
      jobDescription: FULL.trim(),
    });
  });

  it("leaves the job alone on a bot check", async () => {
    vi.mocked(readHiringCafeBrowserPage).mockResolvedValue({
      status: 403,
      challenged: true,
      html: "",
    });
    await expect(refreshHiringCafeDescription(summaryJob())).resolves.toBe(
      "challenged",
    );
    expect(jobsRepo.updateJob).not.toHaveBeenCalled();
  });

  it("backfills applied jobs first and stops at a bot check", async () => {
    vi.mocked(jobsRepo.getAllJobs).mockResolvedValue([
      summaryJob({ id: "review", status: "discovered" }),
      summaryJob({ id: "applied", status: "applied" }),
      summaryJob({ id: "ready", status: "ready" }),
    ]);
    vi.mocked(readHiringCafeBrowserPage)
      .mockResolvedValueOnce(detailPage(FULL))
      .mockResolvedValueOnce({ status: 403, challenged: true, html: "" });

    const result = await backfillHiringCafeDescriptions({
      shouldStop: () => false,
      gapMs: 0,
    });

    expect(result).toEqual({ updated: 1, tried: 2 });
    expect(jobsRepo.updateJob).toHaveBeenCalledWith("applied", {
      jobDescription: FULL.trim(),
    });
  });
});

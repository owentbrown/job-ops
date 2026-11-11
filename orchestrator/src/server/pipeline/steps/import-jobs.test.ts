import type { CreateJobInput } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importJobsStep } from "./import-jobs";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn() },
}));

vi.mock("@server/repositories/jobs", () => ({
  createJobs: vi.fn(async () => ({ created: 1, skipped: 0 })),
  getTitleEmployerPairsSince: vi.fn(async () => []),
  getAllJobUrls: vi.fn(async () => []),
}));

vi.mock("../progress", () => ({
  progressHelpers: {
    importingJob: vi.fn(),
    importComplete: vi.fn(),
  },
}));

describe("importJobsStep", () => {
  it("publishes the job currently being imported", async () => {
    const jobsRepo = await import("@server/repositories/jobs");
    const { progressHelpers } = await import("../progress");
    const job: CreateJobInput = {
      source: "linkedin",
      title: "Frontend Engineer",
      employer: "Monzo",
      jobUrl: "https://example.com/jobs/1",
    };

    await importJobsStep({ discoveredJobs: [job] });

    const onProgress = vi.mocked(jobsRepo.createJobs).mock.calls[0]?.[1];
    expect(onProgress).toBeTypeOf("function");
    onProgress?.(job, 1, 1);

    expect(progressHelpers.importingJob).toHaveBeenCalledWith(1, 1, {
      id: job.jobUrl,
      title: job.title,
      employer: job.employer,
    });
  });
});

describe("importJobsStep repost matching", () => {
  const job = (overrides: Partial<CreateJobInput>): CreateJobInput => ({
    source: "indeed",
    title: "Senior Product Manager",
    employer: "Arctic Wolf",
    jobUrl: "https://example.com/new",
    ...overrides,
  });

  beforeEach(async () => {
    const jobsRepo = await import("@server/repositories/jobs");
    vi.mocked(jobsRepo.createJobs).mockClear();
    vi.mocked(jobsRepo.getAllJobUrls).mockResolvedValue([]);
    vi.mocked(jobsRepo.getTitleEmployerPairsSince).mockResolvedValue([
      {
        title: "Senior Product Manager",
        employer: "Arctic Wolf Networks Inc.",
      },
    ]);
  });

  it("drops a new URL whose title + company match a saved job", async () => {
    const jobsRepo = await import("@server/repositories/jobs");
    const result = await importJobsStep({
      discoveredJobs: [
        job({
          title: "Senior Product Manager",
          employer: "Arctic Wolf Networks",
        }),
        job({
          title: "Product Manager, Growth",
          jobUrl: "https://example.com/2",
        }),
      ],
    });
    expect(result.repostsSkipped).toBe(1);
    const imported = vi.mocked(jobsRepo.createJobs).mock.calls[0]?.[0];
    expect(imported).toHaveLength(1);
    expect((imported as CreateJobInput[])[0]?.title).toBe(
      "Product Manager, Growth",
    );
  });

  it("matches case and punctuation but not near-miss titles", async () => {
    const result = await importJobsStep({
      discoveredJobs: [
        job({
          title: "senior product manager!",
          employer: "ARCTIC WOLF NETWORKS",
        }),
        job({
          title: "Senior Product Manager II",
          jobUrl: "https://example.com/3",
          employer: "Arctic Wolf Networks",
        }),
      ],
    });
    expect(result.repostsSkipped).toBe(1);
  });

  it("leaves same-URL jobs to the normal URL check", async () => {
    const jobsRepo = await import("@server/repositories/jobs");
    vi.mocked(jobsRepo.getAllJobUrls).mockResolvedValue([
      "https://example.com/new",
    ]);
    const result = await importJobsStep({
      discoveredJobs: [job({ employer: "Arctic Wolf Networks" })],
    });
    expect(result.repostsSkipped).toBe(0);
    expect(vi.mocked(jobsRepo.createJobs).mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("only looks back over the repost window", async () => {
    const jobsRepo = await import("@server/repositories/jobs");
    await importJobsStep({ discoveredJobs: [job({})] });
    const since = vi
      .mocked(jobsRepo.getTitleEmployerPairsSince)
      .mock.calls.at(-1)?.[0] as string;
    const days = (Date.now() - Date.parse(since)) / 86_400_000;
    expect(Math.round(days)).toBe(60);
  });
});

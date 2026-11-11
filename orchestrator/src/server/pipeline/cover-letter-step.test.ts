import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCoverLetter } from "../repositories/cover-letter";
import * as jobsRepo from "../repositories/jobs";
import { generateCoverLetter } from "../services/cover-letter/generate";
import { ensureCoverLetter } from "./orchestrator";

vi.mock("@infra/logger", () => {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return { logger };
});

vi.mock("@infra/product-analytics", () => ({
  trackServerProductEvent: vi.fn(),
}));

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock("../repositories/cover-letter", () => ({
  setCoverLetter: vi.fn(),
}));

vi.mock("../services/cover-letter/generate", () => ({
  generateCoverLetter: vi.fn(),
}));

vi.mock("./steps", () => ({
  discoverJobsStep: vi.fn(),
  importJobsStep: vi.fn(),
  loadProfileStep: vi.fn(),
  notifyPipelineWebhookStep: vi.fn(),
  processJobsStep: vi.fn(),
  scoreJobsStep: vi.fn(),
  selectJobsStep: vi.fn(),
}));

const job = {
  id: "job-1",
  title: "Product Manager",
  employer: "Acme",
  location: "Toronto",
  jobDescription: "Own the roadmap.",
  coverLetter: null,
};

describe("ensureCoverLetter (cover letter with the resume)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateCoverLetter).mockResolvedValue("Hi Acme team,\n\nHi.");
    vi.mocked(setCoverLetter).mockResolvedValue(true);
  });

  it("drafts and saves a letter when the job has none", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue(job as any);
    await ensureCoverLetter("job-1");
    expect(generateCoverLetter).toHaveBeenCalledTimes(1);
    expect(setCoverLetter).toHaveBeenCalledWith(
      "job-1",
      "Hi Acme team,\n\nHi.",
    );
  });

  it("never overwrites a saved letter", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      ...job,
      coverLetter: "My edited letter",
    } as any);
    await ensureCoverLetter("job-1");
    expect(generateCoverLetter).not.toHaveBeenCalled();
    expect(setCoverLetter).not.toHaveBeenCalled();
  });

  it("skips jobs without a description", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      ...job,
      jobDescription: "  ",
    } as any);
    await ensureCoverLetter("job-1");
    expect(generateCoverLetter).not.toHaveBeenCalled();
  });

  it("doesn't throw when drafting fails, so the resume still builds", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue(job as any);
    vi.mocked(generateCoverLetter).mockRejectedValue(new Error("AI down"));
    await expect(ensureCoverLetter("job-1")).resolves.toBeUndefined();
    expect(setCoverLetter).not.toHaveBeenCalled();
  });
});

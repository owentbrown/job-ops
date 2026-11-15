import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobsRepo from "../repositories/jobs";
import { pickExperienceBulletsForJob } from "../services/experienceBulletSelection";
import { getProfile } from "../services/profile";
import { summarizeJob } from "./orchestrator";

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

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(),
  updatePipelineRun: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  getAllSettings: vi.fn(),
}));

vi.mock("../services/pdf", () => ({
  generatePdf: vi.fn(),
}));

vi.mock("../services/pdf-fingerprint", () => ({
  createJobPdfFingerprint: vi.fn(),
  resolvePdfFingerprintContext: vi.fn(),
}));

vi.mock("../services/profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("../services/projectSelection", () => ({
  pickProjectIdsForJob: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/experienceBulletSelection", () => ({
  pickExperienceBulletsForJob: vi.fn(),
}));

vi.mock("../services/summary", () => ({
  generateTailoring: vi.fn(),
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

const profile = {
  sections: {
    experience: {
      items: [
        {
          id: "exp-1",
          hidden: false,
          company: "Acme",
          position: "Lead",
          period: "2022 - Present",
          description: "<ul><li>One</li><li>Two</li><li>Three</li></ul>",
        },
      ],
    },
  },
};

const baseJob = {
  id: "job-1",
  jobDescription: "Lead role.",
  tailoredSummary: "Existing summary.",
  tailoredHeadline: "Existing headline.",
  tailoredSkills: "[]",
  selectedProjectIds: "",
  selectedExperienceBullets: null,
};

describe("summarizeJob experience bullet selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jobsRepo.getJobById).mockResolvedValue(baseJob as any);
    vi.mocked(jobsRepo.updateJob).mockResolvedValue(undefined as any);
    vi.mocked(getProfile).mockResolvedValue(profile as any);
    vi.mocked(pickExperienceBulletsForJob).mockResolvedValue({
      "exp-1": [2, 0],
    });
  });

  it("stores the picked bullets for the job from the base resume's experience", async () => {
    expect(
      await summarizeJob("job-1", { force: true, fields: ["bullets"] }),
    ).toEqual({ success: true });

    expect(pickExperienceBulletsForJob).toHaveBeenCalledWith({
      jobDescription: "Lead role.",
      jobId: "job-1",
      catalog: [
        expect.objectContaining({
          id: "exp-1",
          bullets: ["One", "Two", "Three"],
        }),
      ],
    });
    expect(jobsRepo.updateJob).toHaveBeenCalledWith("job-1", {
      selectedExperienceBullets: '{"exp-1":[0,2]}',
    });
  });

  it("keeps the stored selection when the model fails", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      ...baseJob,
      selectedExperienceBullets: '{"exp-1":[1]}',
    } as any);
    vi.mocked(pickExperienceBulletsForJob).mockResolvedValue(null);

    await summarizeJob("job-1", { force: true, fields: ["bullets"] });

    expect(jobsRepo.updateJob).toHaveBeenCalledWith("job-1", {});
  });

  it("does not re-pick an existing selection without force", async () => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      ...baseJob,
      selectedExperienceBullets: '{"exp-1":[1]}',
    } as any);

    await summarizeJob("job-1", { fields: ["bullets"] });

    expect(pickExperienceBulletsForJob).not.toHaveBeenCalled();
  });
});

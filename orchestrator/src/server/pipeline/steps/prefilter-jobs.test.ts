import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefilterJobsStep } from "./prefilter-jobs";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@server/repositories/jobs", () => ({
  getUnscoredDiscoveredJobs: vi.fn(),
}));
vi.mock("@server/repositories/prefilter", () => ({
  markJobFiltered: vi.fn(async () => true),
}));
vi.mock("@server/services/prefilter/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@server/services/prefilter/config")>();
  return { ...actual, readPrefilterConfig: vi.fn() };
});
vi.mock("@server/services/prefilter/llm-title-check", () => ({
  checkTitlesWithLlm: vi.fn(),
}));
vi.mock("../progress", () => ({ updateProgress: vi.fn() }));

type Prompt = { title: string; message: string };

describe("prefilterJobsStep", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const jobsRepo = await import("@server/repositories/jobs");
    vi.mocked(jobsRepo.getUnscoredDiscoveredJobs).mockResolvedValue([
      createJob({
        id: "analyst",
        title: "Business Analyst",
        jobDescription: "",
      }),
      createJob({ id: "pm", title: "Product Manager", jobDescription: "" }),
      createJob({
        id: "bball",
        title: "Basketball Operations",
        jobDescription: "",
      }),
      createJob({
        id: "vague",
        title: "Operations Lead",
        jobDescription: "quota",
      }),
      createJob({
        id: "restored",
        title: "Business Analyst",
        filterLayer: "restored",
        jobDescription: "",
      }),
    ]);
  });

  async function useConfig(raw: unknown) {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({
      status: "ok",
      path: "/tmp/prefilter.json",
      config: configModule.parsePrefilterConfig(raw),
    });
    return configModule;
  }

  it("does nothing when the config is off (tests)", async () => {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({
      status: "off-in-tests",
    });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.disabled).toBe(true);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
  });

  it("drops by rules, sends only undecided jobs to the LLM, skips restored jobs", async () => {
    await useConfig({
      title: { include: ["product manager"], exclude: ["analyst"] },
      description: { flagPhrases: ["quota"] },
      llm: { enabled: true },
    });
    const llm = await import("@server/services/prefilter/llm-title-check");
    vi.mocked(llm.checkTitlesWithLlm).mockResolvedValue(
      new Map([
        ["bball", { decision: "drop" as const, reason: "Sports operations" }],
        ["vague", { decision: "maybe" as const, reason: "Unclear" }],
      ]),
    );
    const prefilterRepo = await import("@server/repositories/prefilter");

    const result = await prefilterJobsStep();

    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledWith({
      id: "analyst",
      layer: "rules",
      reason: "title keyword 'analyst'",
    });
    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledWith({
      id: "bball",
      layer: "llm",
      reason: "Sports operations",
    });
    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledTimes(2);

    const llmItems = vi.mocked(llm.checkTitlesWithLlm).mock.calls[0][0];
    expect(llmItems.map((item) => item.job.id)).toEqual(["bball", "vague"]);
    expect(llmItems[1].flags).toEqual(["quota"]);

    expect(result).toEqual({
      disabled: false,
      considered: 4,
      droppedByRules: 1,
      droppedByLlm: 1,
      passed: 2,
    });
  });

  it("skips the LLM when disabled in config", async () => {
    await useConfig({
      title: { exclude: ["analyst"] },
      llm: { enabled: false },
    });
    const llm = await import("@server/services/prefilter/llm-title-check");
    const result = await prefilterJobsStep();
    expect(llm.checkTitlesWithLlm).not.toHaveBeenCalled();
    expect(result.droppedByRules).toBe(1);
    expect(result.passed).toBe(3);
  });

  it("lets everything through when the filter is switched off", async () => {
    await useConfig({ enabled: false, title: { exclude: ["analyst"] } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.disabled).toBe(true);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
  });

  it("stops early when cancelled", async () => {
    await useConfig({
      title: { exclude: ["analyst"] },
      llm: { enabled: true },
    });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const llm = await import("@server/services/prefilter/llm-title-check");
    await prefilterJobsStep({ shouldCancel: () => true });
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
    expect(llm.checkTitlesWithLlm).not.toHaveBeenCalled();
  });

  it("pauses for review first, then re-reads the config", async () => {
    const configModule = await useConfig({ title: { exclude: ["analyst"] } });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ reviewGate: true, waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(waitForResume.mock.calls[0][0].title).toBe(
      "Review filter rules before scoring",
    );
    expect(configModule.readPrefilterConfig).toHaveBeenCalledTimes(2);
    expect(result.droppedByRules).toBe(1);
  });

  it("does not pause when pauseBeforeScoring is off", async () => {
    await useConfig({
      pauseBeforeScoring: false,
      title: { exclude: ["analyst"] },
    });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    await prefilterJobsStep({ reviewGate: true, waitForResume });
    expect(waitForResume).not.toHaveBeenCalled();
  });

  it("does not pause without reviewGate (backlog button)", async () => {
    await useConfig({ title: { exclude: ["analyst"] } });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    await prefilterJobsStep({ waitForResume });
    expect(waitForResume).not.toHaveBeenCalled();
  });

  it("waits on an invalid config and continues once it is fixed", async () => {
    const configModule = await useConfig({
      pauseBeforeScoring: false,
      title: { exclude: ["analyst"] },
    });
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValueOnce({
      status: "invalid",
      path: "/tmp/prefilter.json",
      error: "title.exclude: Expected array",
    });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(waitForResume.mock.calls[0][0].title).toBe(
      "Pre-score filter needs attention",
    );
    expect(waitForResume.mock.calls[0][0].message).toMatch(/Expected array/);
    expect(result.droppedByRules).toBe(1);
  });

  it("throws on a missing config when it cannot pause (fails closed)", async () => {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({
      status: "missing",
      path: "/tmp/prefilter.json",
    });
    await expect(prefilterJobsStep()).rejects.toThrow(
      /No pre-score filter config/,
    );
  });
});

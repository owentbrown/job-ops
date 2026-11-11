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
vi.mock("@server/config/app-mode", () => ({
  getJobOpsAppConfig: vi.fn(() => ({ appMode: "self-hosted" })),
}));

type Prompt = { title: string; message: string };

describe("prefilterJobsStep", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const jobsRepo = await import("@server/repositories/jobs");
    vi.mocked(jobsRepo.getUnscoredDiscoveredJobs).mockResolvedValue([
      createJob({
        location: "Waterloo, ON",
        id: "analyst",
        title: "Business Analyst",
        jobDescription: "",
      }),
      createJob({
        location: "Waterloo, ON",
        id: "pm",
        title: "Product Manager",
        jobDescription: "",
      }),
      createJob({
        location: "Waterloo, ON",
        id: "bball",
        title: "Basketball Operations",
        jobDescription: "",
      }),
      createJob({
        location: "Waterloo, ON",
        id: "vague",
        title: "Operations Lead",
        jobDescription: "quota",
      }),
      createJob({
        location: "Waterloo, ON",
        id: "manual",
        title: "Business Analyst",
        source: "manual",
        jobDescription: "",
      }),
      createJob({
        location: "Waterloo, ON",
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

  it("never filters manually added jobs", async () => {
    await useConfig({ title: { exclude: ["analyst"] } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.considered).toBe(4);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "manual" }),
    );
  });

  it("returns the disabled result immediately in hosted mode", async () => {
    const appMode = await import("@server/config/app-mode");
    vi.mocked(appMode.getJobOpsAppConfig).mockReturnValueOnce({
      appMode: "hosted",
    } as never);
    const configModule = await useConfig({ title: { exclude: ["analyst"] } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.disabled).toBe(true);
    expect(configModule.readPrefilterConfig).not.toHaveBeenCalled();
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
  });

  it("does not pause a second time after the needs-attention pause", async () => {
    const configModule = await useConfig({
      pauseBeforeScoring: true,
      title: { exclude: ["analyst"] },
    });
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValueOnce({
      status: "invalid",
      path: "/tmp/prefilter.json",
      error: "bad",
    });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ reviewGate: true, waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
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

  it("waits on a missing config and proceeds once it appears", async () => {
    const configModule = await useConfig({
      pauseBeforeScoring: false,
      title: { exclude: ["analyst"] },
    });
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValueOnce({
      status: "missing",
      path: "/tmp/prefilter.json",
    });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(waitForResume.mock.calls[0][0].message).toMatch(
      /No pre-score filter config/,
    );
    expect(result.droppedByRules).toBe(1);
  });

  it("drops nothing by LLM when it returns no decisions", async () => {
    await useConfig({
      title: { exclude: ["analyst"] },
      llm: { enabled: true },
    });
    const llm = await import("@server/services/prefilter/llm-title-check");
    vi.mocked(llm.checkTitlesWithLlm).mockResolvedValue(new Map());
    const result = await prefilterJobsStep();
    expect(result.droppedByLlm).toBe(0);
    expect(result.passed).toBe(3);
  });

  it("stops without filtering when cancelled during the wait", async () => {
    const configModule = await useConfig({ title: { exclude: ["analyst"] } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    let cancelled = false;
    const waitForResume = vi.fn(async (_prompt: Prompt) => {
      cancelled = true;
    });
    const result = await prefilterJobsStep({
      reviewGate: true,
      waitForResume,
      shouldCancel: () => cancelled,
    });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(configModule.readPrefilterConfig).toHaveBeenCalledTimes(1);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
    expect(result).toEqual({
      disabled: false,
      considered: 0,
      droppedByRules: 0,
      droppedByLlm: 0,
      passed: 0,
    });
  });

  it("applies no LLM drops when cancelled during the LLM check", async () => {
    await useConfig({
      title: { exclude: ["analyst"] },
      llm: { enabled: true },
    });
    const llm = await import("@server/services/prefilter/llm-title-check");
    const prefilterRepo = await import("@server/repositories/prefilter");
    let cancelled = false;
    vi.mocked(llm.checkTitlesWithLlm).mockImplementation(async () => {
      cancelled = true;
      return new Map([["bball", { decision: "drop" as const, reason: "x" }]]);
    });
    await prefilterJobsStep({ shouldCancel: () => cancelled });
    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledTimes(1); // analyst (rules) only
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalledWith(
      expect.objectContaining({ layer: "llm" }),
    );
  });

  it("does not count a drop when markJobFiltered returns false", async () => {
    await useConfig({
      title: { exclude: ["analyst"] },
      llm: { enabled: false },
    });
    const prefilterRepo = await import("@server/repositories/prefilter");
    vi.mocked(prefilterRepo.markJobFiltered).mockResolvedValueOnce(false);
    const result = await prefilterJobsStep();
    expect(result.droppedByRules).toBe(0);
    expect(result.passed).toBe(4);
  });
});

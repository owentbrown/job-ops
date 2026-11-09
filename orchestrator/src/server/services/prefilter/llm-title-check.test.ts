import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePrefilterConfig } from "./config";
import { buildTitleCheckPrompt, checkTitlesWithLlm } from "./llm-title-check";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Keep the real modelSelection (settings repo → DB) out of this unit test.
vi.mock("../modelSelection", () => ({
  createConfiguredLlmService: vi.fn(),
  resolveLlmModel: vi.fn(),
}));

const llmConfig = parsePrefilterConfig({
  llm: {
    enabled: true,
    batchSize: 2,
    targetRoles: "Product roles",
    hardPasses: "Sales",
  },
}).llm;

const items = [
  {
    job: createJob({
      id: "a",
      title: "Basketball Operations",
      employer: "Raptors",
    }),
    flags: [],
  },
  {
    job: createJob({
      id: "b",
      title: "Solutions Consultant",
      employer: "Acme",
    }),
    flags: ["quota"],
  },
  {
    job: createJob({ id: "c", title: "Deckhand", employer: "Ferry Co" }),
    flags: [],
  },
];

describe("checkTitlesWithLlm", () => {
  const callJson = vi.fn();
  const deps = {
    createService: async () => ({ callJson }),
    resolveModel: async () => "claude-haiku-5-5",
  };

  beforeEach(() => callJson.mockReset());

  it("batches jobs and maps short ids back to job ids", async () => {
    callJson
      .mockResolvedValueOnce({
        success: true,
        data: {
          results: [
            { id: "1", decision: "drop", reason: "Sports team operations" },
            { id: "2", decision: "maybe", reason: "Could be technical" },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          results: [{ id: "1", decision: "drop", reason: "Marine crew" }],
        },
      });

    const result = await checkTitlesWithLlm(items, llmConfig, deps);

    expect(callJson).toHaveBeenCalledTimes(2);
    expect(callJson.mock.calls[0][0].model).toBe("claude-haiku-5-5");
    expect(result.get("a")).toEqual({
      decision: "drop",
      reason: "Sports team operations",
    });
    expect(result.get("b")).toEqual({
      decision: "maybe",
      reason: "Could be technical",
    });
    expect(result.get("c")).toEqual({
      decision: "drop",
      reason: "Marine crew",
    });
  });

  it("uses the config model override when set", async () => {
    callJson.mockResolvedValue({ success: true, data: { results: [] } });
    await checkTitlesWithLlm(
      items.slice(0, 1),
      { ...llmConfig, model: "custom-model" },
      deps,
    );
    expect(callJson.mock.calls[0][0].model).toBe("custom-model");
  });

  it("lets everything through when the LLM call fails", async () => {
    callJson.mockResolvedValue({ success: false, error: "boom" });
    const result = await checkTitlesWithLlm(items, llmConfig, deps);
    expect(result.size).toBe(0);
  });

  it("lets everything through when the service throws", async () => {
    const result = await checkTitlesWithLlm(items, llmConfig, {
      ...deps,
      createService: async () => {
        throw new Error("not configured");
      },
    });
    expect(result.size).toBe(0);
  });

  it("ignores unknown ids and invalid decisions", async () => {
    callJson.mockResolvedValue({
      success: true,
      data: {
        results: [
          { id: "9", decision: "drop", reason: "x" },
          { id: "1", decision: "nope", reason: "x" },
        ],
      },
    });
    const result = await checkTitlesWithLlm(items.slice(0, 1), llmConfig, deps);
    expect(result.size).toBe(0);
  });
});

describe("buildTitleCheckPrompt", () => {
  it("includes targets, hard passes, flags and a truncated excerpt", () => {
    const prompt = buildTitleCheckPrompt(
      [
        {
          job: createJob({
            title: "Solutions Consultant",
            employer: "Acme",
            location: "Remote",
            jobDescription: `<p>${"x".repeat(1000)}</p>`,
          }),
          flags: ["quota"],
        },
      ],
      { ...llmConfig, descriptionChars: 50 },
    );
    expect(prompt).toContain("Product roles");
    expect(prompt).toContain("Sales");
    expect(prompt).toContain(
      "[1] Title: Solutions Consultant | Company: Acme | Location: Remote | Flags: quota",
    );
    expect(prompt).toContain(`Excerpt: ${"x".repeat(50)}\n`);
    expect(prompt).not.toContain("x".repeat(51));
  });
});

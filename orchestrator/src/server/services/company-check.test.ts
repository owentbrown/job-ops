import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { create };
  }
  return { default: Anthropic };
});

vi.mock("@server/services/modelSelection", () => ({
  resolveLlmRuntimeSettings: vi.fn(),
}));

vi.mock("@server/services/llm/usage", () => ({
  recordLlmUsage: vi.fn(),
}));

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { resolveLlmRuntimeSettings } = await import(
  "@server/services/modelSelection"
);
const { recordLlmUsage } = await import("@server/services/llm/usage");
const {
  collectSources,
  getCompanyCheckUnavailableReason,
  parseCompanyCheckAnswer,
  runCompanyCheck,
} = await import("./company-check");

const runtime = (overrides = {}) => ({
  model: "claude-haiku-5-5",
  provider: "anthropic",
  baseUrl: null,
  apiKey: "test-key",
  allowEnvironmentCredentials: true,
  allowCliProviders: true,
  ...overrides,
});

const answerJson = {
  summary: "A well-liked networking company.",
  ratings: [
    {
      source: "Glassdoor",
      rating: 4.6,
      reviewCount: 120,
      url: "https://www.glassdoor.ca/Reviews/Tailscale",
    },
    {
      source: "Made up",
      rating: "n/a",
      reviewCount: null,
      url: "javascript:x",
    },
  ],
  pros: ["Remote-first"],
  cons: ["Fast pace"],
  redFlags: [],
};

const searchResult = {
  type: "web_search_tool_result",
  tool_use_id: "t1",
  content: [
    {
      type: "web_search_result",
      title: "Tailscale reviews",
      url: "https://www.glassdoor.ca/Reviews/Tailscale",
      encrypted_content: "x",
      page_age: null,
    },
    {
      type: "web_search_result",
      title: "Duplicate",
      url: "https://www.glassdoor.ca/Reviews/Tailscale",
      encrypted_content: "x",
      page_age: null,
    },
  ],
};

describe("parseCompanyCheckAnswer", () => {
  it("reads the last json block and drops invalid values", () => {
    const parsed = parseCompanyCheckAnswer(
      `Here you go.\n\`\`\`json\n${JSON.stringify(answerJson)}\n\`\`\``,
    );
    expect(parsed?.summary).toBe("A well-liked networking company.");
    expect(parsed?.ratings[1]?.rating).toBeNull();
    expect(parsed?.pros).toEqual(["Remote-first"]);
  });

  it("returns null when there is no JSON", () => {
    expect(parseCompanyCheckAnswer("no idea")).toBeNull();
  });
});

describe("collectSources", () => {
  it("keeps unique http(s) search results", () => {
    expect(collectSources([searchResult] as never)).toEqual([
      {
        label: "Tailscale reviews",
        url: "https://www.glassdoor.ca/Reviews/Tailscale",
      },
    ]);
  });
});

describe("runCompanyCheck", () => {
  beforeEach(() => {
    create.mockReset();
    vi.mocked(recordLlmUsage).mockClear();
    vi.mocked(resolveLlmRuntimeSettings).mockResolvedValue(runtime());
  });

  it("explains when the provider is not Anthropic", async () => {
    vi.mocked(resolveLlmRuntimeSettings).mockResolvedValue(
      runtime({ provider: "openrouter" }),
    );
    expect(await getCompanyCheckUnavailableReason()).toMatch(/Anthropic/);
    const result = await runCompanyCheck({ employer: "Tailscale" });
    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("searches, resumes a paused turn, and records the cost", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "pause_turn",
        content: [searchResult],
        usage: {
          input_tokens: 10_000,
          output_tokens: 100,
          server_tool_use: { web_search_requests: 2 },
        },
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [
          { type: "text", text: `\`\`\`json\n${JSON.stringify(answerJson)}` },
          { type: "text", text: "\n```" },
        ],
        usage: {
          input_tokens: 20_000,
          output_tokens: 400,
          server_tool_use: { web_search_requests: 1 },
        },
      });

    const result = await runCompanyCheck({
      employer: "tailscale",
      jobTitle: "Senior BizOps Manager",
      jobId: "job-1",
    });

    expect(create).toHaveBeenCalledTimes(2);
    const firstRequest = create.mock.calls[0]?.[0];
    expect(firstRequest.model).toBe("claude-haiku-5-5");
    expect(firstRequest.tools[0]).toMatchObject({
      type: "web_search_20250305",
      name: "web_search",
    });
    expect(firstRequest.messages[0].content).toContain("Senior BizOps Manager");
    // The paused turn is sent back so the model can continue.
    expect(create.mock.calls[1]?.[0].messages).toHaveLength(2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.check.searches).toBe(3);
    expect(result.check.ratings[0]).toMatchObject({
      source: "Glassdoor",
      rating: 4.6,
    });
    expect(result.check.ratings[1]?.url).toBeNull();
    expect(result.check.sources).toHaveLength(1);
    // 30,000 in x $0.10/M + 500 out x $0.50/M + 3 searches x $0.01
    expect(result.check.costUsd).toBeCloseTo(0.0033 + 0.03, 4);

    expect(recordLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "company_check",
        jobId: "job-1",
        success: true,
        extraCostUsd: 0.03,
        usage: expect.objectContaining({
          inputTokens: 30_000,
          outputTokens: 500,
        }),
      }),
    );
  });

  it("fails cleanly on an unreadable answer but still records spend", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I could not find it." }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });
    const result = await runCompanyCheck({ employer: "Nobody Corp" });
    expect(result.ok).toBe(false);
    expect(recordLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

import { describe, expect, it } from "vitest";
import { extractTokenUsage } from "./usage";

describe("extractTokenUsage", () => {
  it("reads Anthropic usage, including cache tokens", () => {
    expect(
      extractTokenUsage({
        content: [],
        usage: {
          input_tokens: 1200,
          output_tokens: 80,
          cache_creation_input_tokens: 300,
          cache_read_input_tokens: 4000,
        },
      }),
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cacheWriteTokens: 300,
      cacheReadTokens: 4000,
    });
  });

  it("reads OpenAI-style usage and splits out cached prompt tokens", () => {
    expect(
      extractTokenUsage({
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 400 },
        },
      }),
    ).toEqual({
      inputTokens: 600,
      outputTokens: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 400,
    });
  });

  it("reads Gemini usage metadata, counting thinking as output", () => {
    expect(
      extractTokenUsage({
        usageMetadata: {
          promptTokenCount: 900,
          candidatesTokenCount: 100,
          thoughtsTokenCount: 20,
          cachedContentTokenCount: 100,
        },
      }),
    ).toEqual({
      inputTokens: 800,
      outputTokens: 120,
      cacheWriteTokens: 0,
      cacheReadTokens: 100,
    });
  });

  it("returns null when there is no usage", () => {
    expect(extractTokenUsage({ choices: [] })).toBeNull();
    expect(extractTokenUsage(null)).toBeNull();
  });

  it("ignores junk values", () => {
    expect(
      extractTokenUsage({ usage: { input_tokens: "lots", output_tokens: -5 } }),
    ).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

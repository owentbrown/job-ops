import { describe, expect, it } from "vitest";
import { costOf, DEFAULT_MODEL_PRICES, findModelPrice } from "./pricing";

describe("findModelPrice", () => {
  const table = DEFAULT_MODEL_PRICES;

  it("matches exact ids", () => {
    expect(findModelPrice("claude-haiku-5-5", table)?.input).toBe(0.1);
    expect(findModelPrice("claude-opus-5", table)?.input).toBe(5);
  });

  it("doesn't confuse a model with a newer one sharing its prefix", () => {
    expect(findModelPrice("claude-opus-5-5", table)?.input).toBe(4);
  });

  it("matches router prefixes and dated suffixes", () => {
    expect(findModelPrice("anthropic/claude-haiku-5-5", table)?.input).toBe(
      0.1,
    );
    expect(findModelPrice("claude-haiku-5-5-20261001", table)?.input).toBe(0.1);
  });

  it("returns null for unknown models", () => {
    expect(findModelPrice("gpt-5-mini", table)).toBeNull();
  });
});

describe("costOf", () => {
  it("prices every token kind per million", () => {
    const cost = costOf(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
      },
      { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 },
    );
    expect(cost).toBe(10);
  });

  it("puts a typical Haiku scoring call at a fraction of a cent", () => {
    const price = findModelPrice("claude-haiku-5-5", DEFAULT_MODEL_PRICES);
    if (!price) throw new Error("missing price");
    const cost = costOf(
      {
        inputTokens: 3000,
        outputTokens: 400,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      },
      price,
    );
    expect(cost).toBeCloseTo(0.0005, 6);
  });
});

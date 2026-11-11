/**
 * Per-model prices used to turn recorded tokens into dollar estimates
 * (fork: spend). Built-in defaults cover the Anthropic models; the user can
 * edit any price or add models (e.g. for another provider) from the Spend
 * page. Overrides live in <dataDir>/llm-pricing.json.
 *
 * Prices are USD per million tokens.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import { z } from "zod";

export const modelPriceSchema = z.object({
  input: z.number().min(0).max(10_000),
  output: z.number().min(0).max(10_000),
  cacheWrite: z.number().min(0).max(10_000),
  cacheRead: z.number().min(0).max(10_000),
});

export type ModelPrice = z.infer<typeof modelPriceSchema>;

function price(
  input: number,
  output: number,
  cacheRead = input * 0.1,
): ModelPrice {
  return { input, output, cacheWrite: input * 1.25, cacheRead };
}

/**
 * Anthropic first-party list prices as of November 2026. Claude Haiku 5.5 is
 * $0.10 / $0.50 for prompts up to 100K tokens; this app's prompts are far
 * below that, so the long-prompt tier is ignored.
 */
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-2": price(8, 40, 0.2),
  "claude-fable-5-1": price(10, 50),
  "claude-fable-5": price(10, 50),
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25),
  "claude-opus-4-8": price(5, 25),
  "claude-opus-4-7": price(5, 25),
  "claude-opus-4-6": price(5, 25),
  "claude-sonnet-5-5": price(2, 10, 0.1),
  "claude-sonnet-5": price(2, 10),
  "claude-sonnet-4-6": price(3, 15),
  "claude-haiku-5-5": price(0.1, 0.5),
  "claude-haiku-4-5": price(1, 5),
};

const overridesFileSchema = z.object({
  models: z.record(z.string().min(1).max(200), modelPriceSchema).default({}),
});

export function getPricingFilePath(): string {
  return join(getDataDir(), "llm-pricing.json");
}

function readOverrides(): Record<string, ModelPrice> {
  const path = getPricingFilePath();
  if (!existsSync(path)) return {};
  try {
    const parsed = overridesFileSchema.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (parsed.success) return parsed.data.models;
    logger.warn("Pricing file is invalid; using defaults", {
      error: parsed.error.message,
    });
  } catch (error) {
    logger.warn("Pricing file unreadable; using defaults", { error });
  }
  return {};
}

export type PriceTable = {
  /** Effective prices: defaults with the user's edits on top. */
  models: Record<string, ModelPrice>;
  /** Model ids whose price the user has set or changed. */
  customized: string[];
};

export function getPriceTable(): PriceTable {
  const overrides = readOverrides();
  return {
    models: { ...DEFAULT_MODEL_PRICES, ...overrides },
    customized: Object.keys(overrides),
  };
}

/**
 * Save the user's price edits. Only entries that differ from the built-in
 * default are kept, so later default updates still reach untouched models.
 */
export async function savePriceTable(
  models: Record<string, ModelPrice>,
): Promise<PriceTable> {
  const overrides: Record<string, ModelPrice> = {};
  for (const [model, value] of Object.entries(models)) {
    const id = model.trim();
    if (!id) continue;
    const base = DEFAULT_MODEL_PRICES[id];
    if (base && JSON.stringify(base) === JSON.stringify(value)) continue;
    overrides[id] = value;
  }
  const path = getPricingFilePath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(
    tmp,
    `${JSON.stringify({ models: overrides }, null, 2)}\n`,
    "utf8",
  );
  await rename(tmp, path);
  return getPriceTable();
}

/** Strip router prefixes ("anthropic/claude-…") and dated suffixes. */
function normalizeModelId(model: string): string {
  const bare = model.includes("/") ? (model.split("/").pop() ?? model) : model;
  return bare.trim().toLowerCase();
}

/**
 * Price for a recorded model id: exact match first, then the longest table
 * entry the id starts with (so "claude-haiku-5-5-20261001" or a router's
 * "anthropic/claude-haiku-5-5" still match). Null when unknown.
 */
export function findModelPrice(
  model: string,
  table: Record<string, ModelPrice>,
): ModelPrice | null {
  const lowered: Record<string, ModelPrice> = {};
  for (const [key, value] of Object.entries(table)) {
    lowered[key.toLowerCase()] = value;
  }
  for (const candidate of [
    model.trim().toLowerCase(),
    normalizeModelId(model),
  ]) {
    if (lowered[candidate]) return lowered[candidate];
  }
  const id = normalizeModelId(model);
  let best: string | null = null;
  for (const key of Object.keys(lowered)) {
    if (id.startsWith(`${key}-`) && (!best || key.length > best.length)) {
      best = key;
    }
  }
  return best ? lowered[best] : null;
}

export function costOf(
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  },
  p: ModelPrice,
): number {
  return (
    (tokens.inputTokens * p.input +
      tokens.outputTokens * p.output +
      tokens.cacheWriteTokens * p.cacheWrite +
      tokens.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

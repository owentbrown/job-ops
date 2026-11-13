/**
 * AI spend tracking (fork: spend). Every HTTP model call made through
 * LlmService records the token counts the provider reports, tagged with what
 * the call was for and the job / pipeline run it belonged to. Dollars are
 * worked out later from the price table (services/spend/pricing.ts).
 *
 * Recording never throws and never delays the caller: a failed insert only
 * logs a warning.
 */
import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import { getRequestContext } from "@infra/request-context";
import { db, schema } from "@server/db";
import { getActiveTenantId } from "@server/tenancy/context";

export const LLM_FEATURES = [
  "scoring",
  "title_check",
  "tailoring",
  "project_selection",
  "cover_letter",
  "chat",
  "manual_job",
  "search_plan",
  "search_terms",
  "resume_suggestion",
  "email_triage",
  "profile_skills",
  "profile_writing",
  "other",
] as const;

export type LlmFeature = (typeof LLM_FEATURES)[number];

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/**
 * Pull token counts out of a provider response. Handles the three shapes the
 * supported providers use: Anthropic (`usage.input_tokens`), OpenAI-style
 * (`usage.prompt_tokens`, used by OpenRouter, LiteLLM, Ollama and friends)
 * and Gemini (`usageMetadata.promptTokenCount`). Returns null when the
 * response carries no usage at all.
 */
export function extractTokenUsage(response: unknown): TokenUsage | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;

  const usage = r.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    // Anthropic: input_tokens excludes cached tokens, which are reported
    // separately.
    if ("input_tokens" in usage || "output_tokens" in usage) {
      return {
        inputTokens: num(usage.input_tokens),
        outputTokens: num(usage.output_tokens),
        cacheWriteTokens: num(usage.cache_creation_input_tokens),
        cacheReadTokens: num(usage.cache_read_input_tokens),
      };
    }
    // OpenAI-style: prompt_tokens includes cached tokens.
    if ("prompt_tokens" in usage || "completion_tokens" in usage) {
      const details = usage.prompt_tokens_details as
        | Record<string, unknown>
        | undefined;
      const cached = num(details?.cached_tokens);
      return {
        inputTokens: Math.max(0, num(usage.prompt_tokens) - cached),
        outputTokens: num(usage.completion_tokens),
        cacheWriteTokens: 0,
        cacheReadTokens: cached,
      };
    }
  }

  const meta = r.usageMetadata as Record<string, unknown> | undefined;
  if (meta && typeof meta === "object") {
    const cached = num(meta.cachedContentTokenCount);
    return {
      inputTokens: Math.max(0, num(meta.promptTokenCount) - cached),
      outputTokens:
        num(meta.candidatesTokenCount) + num(meta.thoughtsTokenCount),
      cacheWriteTokens: 0,
      cacheReadTokens: cached,
    };
  }

  return null;
}

export function recordLlmUsage(args: {
  provider: string;
  model: string;
  feature?: LlmFeature;
  jobId?: string;
  usage: TokenUsage;
  success: boolean;
}): void {
  try {
    const ctx = getRequestContext();
    db.insert(schema.llmUsage)
      .values({
        id: randomUUID(),
        tenantId: getActiveTenantId(),
        userId: ctx?.userId ?? null,
        createdAt: new Date().toISOString(),
        provider: args.provider,
        model: args.model,
        feature: args.feature ?? "other",
        jobId: args.jobId ?? ctx?.jobId ?? null,
        pipelineRunId: ctx?.pipelineRunId ?? null,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        cacheWriteTokens: args.usage.cacheWriteTokens,
        cacheReadTokens: args.usage.cacheReadTokens,
        success: args.success,
      })
      .run();
  } catch (error) {
    logger.warn("Could not record AI usage", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

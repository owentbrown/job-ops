import { logger } from "@infra/logger";
import { stripHtmlTags } from "@shared/utils/string";
import type { LlmService } from "../llm/service";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import type { PrefilterConfig } from "./config";
import type { PrefilterJob } from "./types";

export type LlmTitleDecision = {
  decision: "keep" | "drop" | "maybe";
  reason: string;
};
export type TitleCheckItem = { job: PrefilterJob; flags: string[] };

type TitleCheckDeps = {
  createService: () => Promise<Pick<LlmService, "callJson">>;
  resolveModel: () => Promise<string>;
};

const defaultDeps: TitleCheckDeps = {
  createService: () => createConfiguredLlmService("scoring"),
  resolveModel: () => resolveLlmModel("scoring"),
};

const DECISIONS = new Set(["keep", "drop", "maybe"]);

const TITLE_CHECK_SCHEMA: JsonSchemaDefinition = {
  name: "prefilter_title_check",
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The job number shown in brackets",
            },
            decision: { type: "string", enum: ["keep", "drop", "maybe"] },
            reason: {
              type: "string",
              description: "One short line, max 15 words",
            },
          },
          required: ["id", "decision", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

function excerpt(description: string | null, chars: number): string {
  if (chars <= 0) return "";
  return stripHtmlTags(description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, chars);
}

export function buildTitleCheckPrompt(
  batch: TitleCheckItem[],
  config: PrefilterConfig["llm"],
): string {
  const jobs = batch
    .map(({ job, flags }, index) => {
      const header = `[${index + 1}] Title: ${job.title} | Company: ${job.employer} | Location: ${job.location ?? "unknown"} | Flags: ${flags.length > 0 ? flags.join(", ") : "none"}`;
      return `${header}\nExcerpt: ${excerpt(job.jobDescription, config.descriptionChars)}\n`;
    })
    .join("\n");

  return `You are a fast pre-screen for a job search. For each job, decide whether it is plausibly relevant to the candidate using only the title, company, location and a short description excerpt.

Candidate is targeting:
${config.targetRoles || "(not specified)"}

Hard passes:
${config.hardPasses || "(none)"}

Rules:
- "drop" only when the job is clearly outside the target roles or clearly a hard pass (for example sports team operations, boat or marine crew, trades, court or legal services, retail, clinical roles).
- "keep" when the job clearly matches the target roles.
- "maybe" when unsure. When in doubt answer "maybe": wrongly dropping a good role is much worse than reviewing an extra one.
- Flags are phrases found in the description; treat them as hints, not proof.
- Return one result per job, using the bracketed number as id. reason is one short line (max 15 words).

Jobs:
${jobs}`;
}

/**
 * Returns decisions keyed by job id. Jobs missing from the map (LLM failure,
 * unknown id, bad output) must be treated as "pass through to full scoring".
 */
export async function checkTitlesWithLlm(
  items: TitleCheckItem[],
  config: PrefilterConfig["llm"],
  deps: TitleCheckDeps = defaultDeps,
): Promise<Map<string, LlmTitleDecision>> {
  const decisions = new Map<string, LlmTitleDecision>();
  if (items.length === 0) return decisions;

  let llm: Pick<LlmService, "callJson">;
  let model: string;
  try {
    llm = await deps.createService();
    model = config.model ?? (await deps.resolveModel());
  } catch (error) {
    logger.warn("Prefilter LLM unavailable; skipping title check", {
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
    return decisions;
  }

  for (let start = 0; start < items.length; start += config.batchSize) {
    const batch = items.slice(start, start + config.batchSize);
    const result = await llm.callJson<{
      results: Array<{ id: string; decision: string; reason: string }>;
    }>({
      model,
      messages: [
        { role: "user", content: buildTitleCheckPrompt(batch, config) },
      ],
      jsonSchema: TITLE_CHECK_SCHEMA,
      maxRetries: 1,
    });

    if (!result.success) {
      logger.warn("Prefilter title check batch failed; letting batch through", {
        batchStart: start,
        batchSize: batch.length,
        error: result.error.slice(0, 300),
      });
      continue;
    }

    for (const entry of result.data.results ?? []) {
      const index = Number.parseInt(entry.id, 10) - 1;
      const item = batch[index];
      if (!item || !DECISIONS.has(entry.decision)) continue;
      decisions.set(item.job.id, {
        decision: entry.decision as LlmTitleDecision["decision"],
        reason:
          String(entry.reason ?? "")
            .trim()
            .slice(0, 200) || "no reason given",
      });
    }
  }

  return decisions;
}

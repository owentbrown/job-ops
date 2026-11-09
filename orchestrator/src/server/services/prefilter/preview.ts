import type { PrefilterConfig } from "./config";
import { evaluateRules, type RuleOutcome } from "./rules";
import type { PrefilterJob } from "./types";

type Decision = RuleOutcome["decision"];

export type PreviewItem = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  decision: Decision;
  detail: string;
};

export type PreviewResult = {
  total: number;
  counts: Record<Decision, number>;
  items: PreviewItem[];
};

const ORDER: Record<Decision, number> = { drop: 0, undecided: 1, keep: 2 };

/** Rules layer only: no LLM, no writes. Undecided jobs would go to the AI title check. */
export function previewRules(
  jobs: PrefilterJob[],
  config: PrefilterConfig,
  limit = 1000,
): PreviewResult {
  const counts: Record<Decision, number> = { drop: 0, keep: 0, undecided: 0 };
  const items: PreviewItem[] = [];
  for (const job of jobs) {
    const outcome = evaluateRules(job, config);
    counts[outcome.decision] += 1;
    items.push({
      id: job.id,
      title: job.title,
      employer: job.employer,
      location: job.location ?? null,
      decision: outcome.decision,
      detail:
        outcome.decision === "undecided"
          ? outcome.flags.length > 0
            ? `flags: ${outcome.flags.join(", ")}`
            : "→ AI title check"
          : outcome.reason,
    });
  }
  items.sort((a, b) => ORDER[a.decision] - ORDER[b.decision]);
  return { total: jobs.length, counts, items: items.slice(0, limit) };
}

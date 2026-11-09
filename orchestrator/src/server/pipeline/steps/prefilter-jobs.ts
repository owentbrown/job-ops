import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as prefilterRepo from "@server/repositories/prefilter";
import {
  type PrefilterConfig,
  readPrefilterConfig,
} from "@server/services/prefilter/config";
import {
  checkTitlesWithLlm,
  type TitleCheckItem,
} from "@server/services/prefilter/llm-title-check";
import { evaluateRules } from "@server/services/prefilter/rules";
import { updateProgress } from "../progress";

export type PrefilterStepResult = {
  disabled: boolean;
  considered: number;
  droppedByRules: number;
  droppedByLlm: number;
  passed: number;
};

export type PrefilterPausePrompt = { title: string; message: string };

export type PrefilterStepArgs = {
  shouldCancel?: () => boolean;
  /**
   * Pauses the run until the user clicks Resume. Without it the step never pauses.
   * It must reject/throw when the run is cancelled while paused.
   */
  waitForResume?: (prompt: PrefilterPausePrompt) => Promise<void>;
  /** Pause for review first when config.pauseBeforeScoring is on (normal runs). */
  reviewGate?: boolean;
};

const REVIEW_PROMPT: PrefilterPausePrompt = {
  title: "Review filter rules before scoring",
  message:
    "Discovery is done. Review or edit your rules in Filtered → Rules (Preview is free), then Resume to run rules → AI title check → full scoring.",
};

function emptyResult(disabled: boolean): PrefilterStepResult {
  return {
    disabled,
    considered: 0,
    droppedByRules: 0,
    droppedByLlm: 0,
    passed: 0,
  };
}

const CANCELLED = Symbol("prefilter-cancelled");

/**
 * Resolves the config to use, pausing when needed. Fails closed: a missing or
 * invalid config pauses the run (or throws when pausing is not possible) and
 * never falls through to "score everything".
 */
async function resolveConfig(
  args: PrefilterStepArgs,
): Promise<PrefilterConfig | null | typeof CANCELLED> {
  let reviewed = !args.reviewGate;
  while (true) {
    if (args.shouldCancel?.()) return CANCELLED;
    const load = await readPrefilterConfig();
    if (load.status === "off-in-tests") return null;

    if (load.status === "missing" || load.status === "invalid") {
      const message =
        load.status === "missing"
          ? `No pre-score filter config found at ${load.path}. Create it in Filtered → Rules, then resume.`
          : `Pre-score filter config is invalid (${load.error}). Fix it in Filtered → Rules, then resume.`;
      if (!args.waitForResume) throw new Error(message);
      await args.waitForResume({
        title: "Pre-score filter needs attention",
        message,
      });
      continue;
    }

    if (!reviewed && load.config.pauseBeforeScoring && args.waitForResume) {
      await args.waitForResume(REVIEW_PROMPT);
      reviewed = true;
      continue; // re-read so edits saved while paused apply to this run
    }

    return load.config;
  }
}

/**
 * Runs before scoring on every unscored discovered job (all runs, not just
 * this one). Dropped jobs become status "skipped" with an audit reason; they
 * are never deleted. Jobs the user restored are never re-filtered.
 */
export async function prefilterJobsStep(
  args: PrefilterStepArgs = {},
): Promise<PrefilterStepResult> {
  const config = await resolveConfig(args);
  if (config === CANCELLED) return emptyResult(false);
  if (!config) {
    logger.info("Prefilter not configured in this environment; skipping");
    return emptyResult(true);
  }
  if (!config.enabled) {
    logger.info("Prefilter switched off in config; all jobs go to scoring");
    return emptyResult(true);
  }
  if (args.shouldCancel?.()) return emptyResult(false);

  const candidates = (await jobsRepo.getUnscoredDiscoveredJobs()).filter(
    (job) => job.filterLayer !== "restored",
  );
  updateProgress({
    step: "scoring",
    message: `Pre-filtering ${candidates.length} jobs before scoring`,
  });

  let droppedByRules = 0;
  let droppedByLlm = 0;
  const undecided: TitleCheckItem[] = [];

  for (const job of candidates) {
    if (args.shouldCancel?.()) break;
    const outcome = evaluateRules(job, config);
    if (outcome.decision === "drop") {
      if (
        await prefilterRepo.markJobFiltered({
          id: job.id,
          layer: "rules",
          reason: outcome.reason,
        })
      ) {
        droppedByRules += 1;
      }
    } else if (outcome.decision === "undecided") {
      undecided.push({ job, flags: outcome.flags });
    }
  }

  if (config.llm.enabled && undecided.length > 0 && !args.shouldCancel?.()) {
    updateProgress({
      step: "scoring",
      message: `Checking ${undecided.length} job titles with the AI pre-screen`,
    });
    // Payload sent to the LLM: title, employer, location, rule flags and the
    // first config.llm.descriptionChars characters of the description, plus the
    // configured target roles / hard passes. No profile or resume data.
    const decisions = await checkTitlesWithLlm(
      undecided,
      config.llm,
      undefined,
      args.shouldCancel,
    );
    if (args.shouldCancel?.()) return emptyResult(false);
    for (const { job } of undecided) {
      const decision = decisions.get(job.id);
      if (decision?.decision !== "drop") continue;
      if (
        await prefilterRepo.markJobFiltered({
          id: job.id,
          layer: "llm",
          reason: decision.reason,
        })
      ) {
        droppedByLlm += 1;
      }
    }
  }

  const result: PrefilterStepResult = {
    disabled: false,
    considered: candidates.length,
    droppedByRules,
    droppedByLlm,
    passed: candidates.length - droppedByRules - droppedByLlm,
  };
  logger.info("Prefilter step completed", result);
  return result;
}

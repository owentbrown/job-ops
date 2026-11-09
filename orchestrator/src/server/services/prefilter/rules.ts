import { stripHtmlTags } from "@shared/utils/string";
import type { PrefilterConfig } from "./config";
import { evaluateSalary } from "./salary";
import { findKeyword, findKeywords, normalizeText } from "./text-match";
import type { PrefilterJob } from "./types";

export type RuleOutcome =
  | { decision: "drop"; reason: string }
  | { decision: "keep"; reason: string }
  | { decision: "undecided"; flags: string[] };

function isRemoteJob(job: PrefilterJob): boolean {
  return (
    job.isRemote === true ||
    /remote/.test(normalizeText(job.location)) ||
    /remote/.test(normalizeText(job.workFromHomeType))
  );
}

/**
 * Order: company → commute → salary → description hard-drop → title include
 * (keep) → title exclude (drop) → undecided. Pure function, no I/O.
 */
export function evaluateRules(
  job: PrefilterJob,
  config: PrefilterConfig,
): RuleOutcome {
  const company = findKeyword(job.employer, config.companyBlocklist);
  if (company)
    return { decision: "drop", reason: `company blocklist '${company}'` };

  if (!isRemoteJob(job)) {
    const place = findKeyword(job.location, config.location.commuteBlocklist);
    if (place) {
      return {
        decision: "drop",
        reason: `location '${place}' needs a commute (not remote)`,
      };
    }
  }

  const salary = evaluateSalary(job, config.salary);
  if (salary.belowFloor) {
    return {
      decision: "drop",
      reason: `salary max ${salary.detail} below $${Math.round(config.salary.floorAnnualCad / 1000)}K floor`,
    };
  }

  const description = stripHtmlTags(job.jobDescription ?? "");
  const hardDrop = findKeyword(description, config.description.hardDropPhrases);
  if (hardDrop)
    return { decision: "drop", reason: `description: '${hardDrop}'` };

  const include = findKeyword(job.title, config.title.include);
  if (include)
    return { decision: "keep", reason: `title include '${include}'` };

  const exclude = findKeyword(job.title, config.title.exclude);
  if (exclude)
    return { decision: "drop", reason: `title keyword '${exclude}'` };

  return {
    decision: "undecided",
    flags: findKeywords(description, config.description.flagPhrases),
  };
}

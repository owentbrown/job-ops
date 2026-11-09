import { stripHtmlTags } from "@shared/utils/string";
import type { PrefilterConfig } from "./config";
import { evaluateSalary } from "./salary";
import {
  findKeyword,
  findKeywordOccurrences,
  findKeywords,
  normalizeText,
} from "./text-match";
import type { PrefilterJob } from "./types";

export type RuleOutcome =
  | { decision: "drop"; reason: string }
  | { decision: "keep"; reason: string }
  | { decision: "undecided"; flags: string[] };

/**
 * Phrases that say the role is remote even when the location field names a
 * commute city. A match sends the job to the LLM check instead of dropping it.
 */
const STRONG_REMOTE_PHRASES = [
  "fully remote",
  "100% remote",
  "remote-first",
  "remote first",
  "work from anywhere",
  "remote in canada",
  "remote within canada",
  "remote across canada",
];

const MULTI_LOCATION = /\s(or|&)\s|[/;|]|multiple/;

/** True when one of the 3 words before the match is a negation (not/no/non/never). */
function isNegated(before: string): boolean {
  const words = before
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(-3)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""));
  return words.some((word) => ["not", "no", "non", "never"].includes(word));
}

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

  const description = stripHtmlTags(job.jobDescription ?? "");
  const extraFlags: string[] = [];
  if (!isRemoteJob(job)) {
    const place = findKeyword(job.location, config.location.commuteBlocklist);
    if (place) {
      if (MULTI_LOCATION.test(normalizeText(job.location))) {
        extraFlags.push(`commute: ${place}`);
      } else if (findKeywords(description, STRONG_REMOTE_PHRASES).length > 0) {
        extraFlags.push(`commute: ${place} (description says remote)`);
      } else {
        return {
          decision: "drop",
          reason: `location '${place}' needs a commute (not remote)`,
        };
      }
    }
  }

  const salary = evaluateSalary(job, config.salary);
  if (salary.belowFloor) {
    return {
      decision: "drop",
      reason: `salary max ${salary.detail} below $${Math.round(config.salary.floorAnnualCad / 1000)}K floor`,
    };
  }

  for (const phrase of config.description.hardDropPhrases) {
    const occurrences = findKeywordOccurrences(description, phrase);
    if (occurrences.length === 0) continue;
    if (occurrences.some((occurrence) => !isNegated(occurrence.before))) {
      return { decision: "drop", reason: `description: '${phrase}'` };
    }
    extraFlags.push(phrase);
  }

  const include = findKeyword(job.title, config.title.include);
  if (include)
    return { decision: "keep", reason: `title include '${include}'` };

  const exclude = findKeyword(job.title, config.title.exclude);
  if (exclude)
    return { decision: "drop", reason: `title keyword '${exclude}'` };

  return {
    decision: "undecided",
    flags: [
      ...new Set([
        ...findKeywords(description, config.description.flagPhrases),
        ...extraFlags,
      ]),
    ],
  };
}

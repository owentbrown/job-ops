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
 * commute city. A match (without a weekly in-office signal) sends the job to
 * the LLM check instead of dropping it.
 */
export const STRONG_REMOTE_PHRASES = [
  "fully remote",
  "100% remote",
  "remote-first",
  "remote first",
  "work from anywhere",
  "remote in canada",
  "remote within canada",
  "remote across canada",
];

/** Remote or occasional-travel phrases: fine for a commute-city job. */
export const OCCASIONAL_PHRASES = [
  ...STRONG_REMOTE_PHRASES,
  "remote role",
  "remote position",
  "work remotely",
  "remote-friendly",
  "quarterly",
  "once a quarter",
  "few times a year",
  "a couple of times a year",
  "occasional travel",
  "occasionally in office",
  "as needed",
  "offsite",
  "off-site",
];

/** Phrases that mean regular (weekly or more) in-office presence. */
export const WEEKLY_PHRASES = [
  "hybrid",
  "in office weekly",
  "in-office weekly",
  "every week in the office",
  "fully on-site",
  "fully onsite",
  "100% on-site",
  "100% onsite",
  "on-site role",
  "onsite role",
  "in-person role",
];

/** Words before a weekly phrase that are searched for a negation. */
const WEEKLY_NEGATION_WINDOW = 6;

const NUMBER = "(?:[1-5]|one|two|three|four|five)";

/** Patterns (run on normalized text) for regular in-office cadence. */
export const WEEKLY_PATTERNS: RegExp[] = [
  new RegExp(
    `(?<![\\p{L}\\p{N}])${NUMBER} days? ?(?:a|per|each|/) ?week`,
    "gu",
  ),
  new RegExp(`(?<![\\p{L}\\p{N}])${NUMBER} ?x ?(?:a|per) ?week`, "gu"),
  /(?<![\p{L}\p{N}])(?:5|five) days in(?:-| )(?:the )?office/gu,
];

const MULTI_LOCATION = /\s(or|&)\s|[/;|]|multiple/;

/** True when one of the 3 words before the match is a negation (not/no/non/never). */
function isNegated(before: string, window = 3): boolean {
  const words = before
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(-window)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""));
  return words.some((word) =>
    ["not", "no", "non", "never", "without"].includes(word),
  );
}

function isRemoteJob(job: PrefilterJob): boolean {
  return (
    job.isRemote === true ||
    /remote/.test(normalizeText(job.location)) ||
    /remote/.test(normalizeText(job.workFromHomeType))
  );
}

/** First non-negated weekly in-office signal in the description, or null. */
export function findWeeklySignal(description: string): string | null {
  for (const phrase of WEEKLY_PHRASES) {
    const hit = findKeywordOccurrences(description, phrase).find(
      (occurrence) => !isNegated(occurrence.before, WEEKLY_NEGATION_WINDOW),
    );
    if (hit) return phrase;
  }
  const text = normalizeText(description);
  for (const pattern of WEEKLY_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, "gu"))) {
      if (!isNegated(text.slice(0, match.index ?? 0), WEEKLY_NEGATION_WINDOW))
        return match[0];
    }
  }
  return null;
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
      const fields = normalizeText(
        `${job.workFromHomeType ?? ""} ${job.location ?? ""}`,
      );
      const weekly =
        findWeeklySignal(description) ??
        (fields.includes("hybrid")
          ? "hybrid"
          : /on-?site/.test(fields)
            ? "on-site"
            : null);
      const isMulti = MULTI_LOCATION.test(normalizeText(job.location));
      const allCommute =
        isMulti &&
        normalizeText(job.location)
          .split(/\s(?:or|&)\s|[/;|]/)
          .every((part) => findKeyword(part, config.location.commuteBlocklist));
      if (weekly && (!isMulti || allCommute)) {
        return {
          decision: "drop",
          reason: `location '${place}': weekly in-office (${weekly})`,
        };
      }
      if (isMulti) {
        extraFlags.push(`commute: ${place}`);
      } else if (findKeywords(description, OCCASIONAL_PHRASES).length > 0) {
        extraFlags.push(`commute: ${place} (remote/occasional travel?)`);
      } else {
        return {
          decision: "drop",
          reason: `location '${place}' needs a commute (no remote signal)`,
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

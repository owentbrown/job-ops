import { stripHtmlTags } from "@shared/utils/string";
import type { PrefilterConfig } from "./config";
import {
  findUsResidencyPhrase,
  isUsOnlyLocation,
  locationIncludesCanada,
  mentionsCanada,
} from "./country";
import { evaluateLanguageRequirement } from "./language";
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
  "remote option",
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

/** The bare word "hybrid" is only a weak weekly signal. */
export const WEAK_WEEKLY_PHRASES = ["hybrid"];

/** "hybrid" uses that are not about the work arrangement. */
const HYBRID_NOISE = /hybrid[- ](?:cloud|infrastructure|environments?)/gu;

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

/** Job boards append the work model ("Toronto, Canada | Hybrid"); that is not a second place. */
const WORK_MODEL_SUFFIX =
  /\s*\|\s*(?:remote|hybrid|on-?site|in[- ]office|in[- ]person)\s*$/;

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

/** Non-negated bare "hybrid" in the description (ignoring hybrid cloud etc.). */
export function findWeakHybridSignal(description: string): string | null {
  const text = normalizeText(description).replace(HYBRID_NOISE, " ");
  for (const phrase of WEAK_WEEKLY_PHRASES) {
    const hit = findKeywordOccurrences(text, phrase).find(
      (occurrence) => !isNegated(occurrence.before, WEEKLY_NEGATION_WINDOW),
    );
    if (hit) return phrase;
  }
  return null;
}

/** First non-negated STRONG weekly in-office signal in the description, or null. */
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

/** Flag that marks a US-listed job the AI check must confirm is open to Canada. */
export const US_LISTED_FLAG =
  "US-listed: keep only if the role can be done from Canada";

/** Company notes the user wrote that apply to this job's employer. */
export function matchCompanyNotes(
  employer: string | null | undefined,
  notes: PrefilterConfig["companyNotes"],
): string[] {
  const compact = (value: string) =>
    normalizeText(value).replace(/[^\p{L}\p{N}]/gu, "");
  const employerCompact = compact(employer ?? "");
  // Whole word ("Float" in "Float Financial") or the same name run together
  // ("Floatfinancial"), since job boards spell employers inconsistently.
  return notes
    .filter(
      (entry) =>
        findKeyword(employer, [entry.company]) ||
        (compact(entry.company).length >= 3 &&
          employerCompact.startsWith(compact(entry.company))),
    )
    .map((entry) => `company note (${entry.company}): ${entry.note}`);
}

/**
 * Order: company → company notes → US-only → commute → salary → description
 * hard-drop → title include (keep) → title exclude (drop) → undecided. A US
 * listing that mentions Canada, or a company note, always goes to the AI
 * check, even when the title would have been an include. Pure, no I/O.
 */
/** Whole days since the posting date; null when missing or unreadable. */
export function postingAgeDays(
  datePosted: string | null | undefined,
  now: Date,
): number | null {
  if (!datePosted?.trim()) return null;
  const posted = Date.parse(datePosted.trim());
  if (Number.isNaN(posted)) return null;
  const days = Math.floor((now.getTime() - posted) / 86_400_000);
  return days >= 0 ? days : 0;
}

export function evaluateRules(
  job: PrefilterJob,
  config: PrefilterConfig,
  now: Date = new Date(),
): RuleOutcome {
  const company = findKeyword(job.employer, config.companyBlocklist);
  if (company)
    return { decision: "drop", reason: `company blocklist '${company}'` };

  const ageDays = postingAgeDays(job.datePosted, now);
  if (
    config.maxPostingAgeDays != null &&
    ageDays != null &&
    ageDays > config.maxPostingAgeDays
  ) {
    return {
      decision: "drop",
      reason: `posted ${ageDays} days ago (limit ${config.maxPostingAgeDays})`,
    };
  }

  const description = stripHtmlTags(job.jobDescription ?? "");
  const extraFlags: string[] = [];

  if (config.language.enabled) {
    const language = evaluateLanguageRequirement({
      title: job.title,
      description,
      languages: config.language.blockedLanguages,
      dropNonEnglishPostings: config.language.dropNonEnglishPostings,
    });
    if (language?.kind === "required") {
      return { decision: "drop", reason: language.reason };
    }
    if (language?.kind === "asset") {
      extraFlags.push(`${language.language} mentioned (asset?)`);
    }
  }
  // Flags the AI check must see: these skip the title-include shortcut.
  const mustCheck: string[] = matchCompanyNotes(
    job.employer,
    config.companyNotes,
  );

  if (config.location.dropUsOnly) {
    const canadianPlaces = config.location.commuteBlocklist;
    if (isUsOnlyLocation(job.location, canadianPlaces)) {
      if (!mentionsCanada(description)) {
        return {
          decision: "drop",
          reason: "US-only location (no mention of Canada)",
        };
      }
      mustCheck.push(US_LISTED_FLAG);
    } else {
      const residency = findUsResidencyPhrase(description);
      if (residency) {
        if (
          !locationIncludesCanada(job.location, canadianPlaces) &&
          !mentionsCanada(description)
        ) {
          return { decision: "drop", reason: `description: '${residency}'` };
        }
        extraFlags.push(`mentions '${residency}'`);
      }
    }
  }
  if (!isRemoteJob(job)) {
    const place = findKeyword(job.location, config.location.commuteBlocklist);
    if (place) {
      const fields = normalizeText(
        `${job.workFromHomeType ?? ""} ${job.location ?? ""}`,
      );
      const strong =
        findWeeklySignal(description) ??
        (/on-?site/.test(fields) ? "on-site" : null);
      const weak =
        findWeakHybridSignal(description) ??
        (fields.includes("hybrid") ? "hybrid" : null);
      const occasional =
        findKeywords(description, OCCASIONAL_PHRASES).length > 0;
      const weekly = strong ?? (occasional ? null : weak);
      const places = normalizeText(job.location).replace(WORK_MODEL_SUFFIX, "");
      const isMulti = MULTI_LOCATION.test(places);
      const allCommute =
        isMulti &&
        places
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
      } else if (weak && occasional) {
        extraFlags.push(`commute: ${place} (hybrid or remote?)`);
      } else if (occasional) {
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
  if (include && mustCheck.length === 0)
    return { decision: "keep", reason: `title include '${include}'` };

  const exclude = include ? null : findKeyword(job.title, config.title.exclude);
  if (exclude)
    return { decision: "drop", reason: `title keyword '${exclude}'` };

  return {
    decision: "undecided",
    flags: [
      ...new Set([
        ...mustCheck,
        ...findKeywords(description, config.description.flagPhrases),
        ...extraFlags,
      ]),
    ],
  };
}

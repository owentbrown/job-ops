/**
 * Language requirement rule (fork: prescore-filter). Finds jobs that need a
 * language other than English:
 *
 *  1. postings written in another language (e.g. a French-only listing),
 *  2. English postings that make another language mandatory
 *     ("Bilingual French/English required", "fluency in Spanish is a must"),
 *  3. titles that signal it ("Bilingual …", "French-speaking …", "… -FR").
 *
 * A language that is only "an asset", "a plus", "preferred" and so on is not
 * a requirement: it comes back as a flag for the AI check, never a drop.
 */
import { normalizeText } from "./text-match";

/** Spellings to look for, keyed by the display name used in config. */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  french: ["french", "français", "francais"],
  spanish: ["spanish", "español", "espanol"],
  german: ["german", "deutsch"],
  portuguese: ["portuguese", "português", "portugues"],
  italian: ["italian", "italiano"],
  dutch: ["dutch"],
  polish: ["polish"],
  russian: ["russian"],
  ukrainian: ["ukrainian"],
  arabic: ["arabic"],
  hebrew: ["hebrew"],
  hindi: ["hindi"],
  punjabi: ["punjabi"],
  urdu: ["urdu"],
  tagalog: ["tagalog", "filipino"],
  vietnamese: ["vietnamese"],
  mandarin: ["mandarin"],
  cantonese: ["cantonese"],
  chinese: ["chinese"],
  japanese: ["japanese"],
  korean: ["korean"],
  turkish: ["turkish"],
  greek: ["greek"],
  swedish: ["swedish"],
  norwegian: ["norwegian"],
  danish: ["danish"],
  finnish: ["finnish"],
};

export const DEFAULT_BLOCKED_LANGUAGES = [
  "French",
  "Spanish",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Mandarin",
  "Cantonese",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Punjabi",
];

/** Common short words, used to tell what language a posting is written in. */
const STOPWORDS: Record<string, string[]> = {
  english: [
    "the",
    "and",
    "of",
    "to",
    "with",
    "for",
    "you",
    "our",
    "will",
    "in",
    "is",
    "are",
    "we",
    "your",
    "this",
    "on",
  ],
  french: [
    "les",
    "des",
    "du",
    "et",
    "vous",
    "nous",
    "pour",
    "avec",
    "dans",
    "une",
    "est",
    "sur",
    "aux",
    "votre",
    "vos",
    "notre",
    "nos",
    "qui",
    "être",
    "au",
    "la",
    "le",
  ],
  spanish: [
    "el",
    "los",
    "las",
    "y",
    "para",
    "con",
    "una",
    "del",
    "por",
    "su",
    "sus",
    "es",
    "nuestro",
    "nuestra",
    "usted",
  ],
  german: [
    "und",
    "der",
    "die",
    "das",
    "mit",
    "für",
    "wir",
    "sie",
    "ist",
    "ein",
    "eine",
    "zu",
    "von",
    "auf",
    "ihre",
  ],
  portuguese: [
    "os",
    "para",
    "com",
    "uma",
    "não",
    "você",
    "nossa",
    "nosso",
    "em",
    "dos",
    "das",
    "na",
    "no",
    "seu",
  ],
};

const WORD = /[\p{L}']+/gu;

/**
 * The language a posting is mainly written in, when it's clearly not
 * English. Bilingual postings with a full English half return null.
 */
export function detectPostingLanguage(text: string): string | null {
  const words = normalizeText(text).match(WORD) ?? [];
  if (words.length < 40) return null;
  const counts: Record<string, number> = {};
  const sets = Object.fromEntries(
    Object.entries(STOPWORDS).map(([lang, list]) => [lang, new Set(list)]),
  );
  for (const word of words) {
    for (const [lang, set] of Object.entries(sets)) {
      if (set.has(word)) counts[lang] = (counts[lang] ?? 0) + 1;
    }
  }
  const english = counts.english ?? 0;
  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (lang === "english") continue;
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  if (!best) return null;
  // Clearly dominant, and a real share of the text.
  if (bestCount >= 12 && bestCount > english * 2) return best;
  return null;
}

const OPTIONAL_WORDS =
  /\b(asset|assets|nice[- ]to[- ]have|a plus|plus|preferred|preferably|bonus|advantage|advantageous|beneficial|desirable|desired|ideally|helpful|optional|not required|not mandatory|not necessary|would be great|considered)\b/u;

/**
 * Requirements that only apply somewhere else or sometimes ("required for
 * Quebec", "if the position is bilingual", "may be required"). Flag, don't
 * drop: the job can still be English-only where the user is.
 */
const CONDITIONAL_WORDS =
  /\b(if|when|where applicable|may|might|depending|quebec|québec|montreal|montréal|for positions in|preference|prefer|qualifications are equal)\b/u;

const MANDATORY_BEFORE =
  /\b(fluent|fluency|fluently|proficient|proficiency|bilingual|bilingualism|native|business[- ]level|professional[- ]level|working knowledge|command|written and (?:spoken|oral|verbal)|spoken and written|oral and written|verbal and written)\b/u;

const MANDATORY_AFTER =
  /\b(required|requirement|mandatory|essential|a must|must[- ]have|is necessary|is needed|needed|obligatoire|requis|exigé|exigée)\b/u;

const MUST_SPEAK =
  /\b(must|required to|need to|needs to|have to|will need to|expected to|able to|ability to)\b[^.;]{0,30}\b(speak|read|write|communicate|converse|work)\b/u;

/** Title words that always mean another language is needed. */
const TITLE_BILINGUAL = /\b(bilingual|bilingue)\b/u;
const TITLE_FR_SUFFIX = /(?:^|[\s(\-–/,])fr(?:$|[\s)\-–/,])/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasesFor(languages: string[]): Array<{ name: string; re: RegExp }> {
  const out: Array<{ name: string; re: RegExp }> = [];
  for (const raw of languages) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const spellings = LANGUAGE_ALIASES[key] ?? [key];
    out.push({
      name,
      re: new RegExp(
        `(?<![\\p{L}])(?:${spellings.map(escapeRegExp).join("|")})(?![\\p{L}])`,
        "u",
      ),
    });
  }
  return out;
}

export type LanguageVerdict =
  | { kind: "required"; language: string; reason: string }
  | { kind: "asset"; language: string }
  | null;

function snippet(sentence: string): string {
  const trimmed = sentence.trim();
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
}

/**
 * Whether the job needs one of `languages`. Checks the title, then whether
 * the posting is written in another language, then requirement sentences.
 */
export function evaluateLanguageRequirement(args: {
  title: string | null | undefined;
  description: string;
  languages: string[];
  dropNonEnglishPostings: boolean;
}): LanguageVerdict {
  const languages = aliasesFor(args.languages);
  const title = normalizeText(args.title);

  if (TITLE_BILINGUAL.test(title)) {
    return {
      kind: "required",
      language: "French",
      reason: "title says bilingual",
    };
  }
  const blocksFrench = languages.some((l) => l.name.toLowerCase() === "french");
  if (blocksFrench && TITLE_FR_SUFFIX.test(title)) {
    return {
      kind: "required",
      language: "French",
      reason: "title marked French (FR)",
    };
  }
  for (const lang of languages) {
    if (
      new RegExp(`${lang.re.source}[- ]speaking`, "u").test(title) ||
      new RegExp(`\\(\\s*${lang.re.source}\\s*\\)`, "u").test(title)
    ) {
      return {
        kind: "required",
        language: lang.name,
        reason: `title asks for ${lang.name}`,
      };
    }
  }

  if (args.dropNonEnglishPostings) {
    const written = detectPostingLanguage(args.description);
    if (written) {
      const display = written.charAt(0).toUpperCase() + written.slice(1);
      return {
        kind: "required",
        language: display,
        reason: `posting is written in ${display}`,
      };
    }
  }

  const text = normalizeText(args.description);
  let asset: string | null = null;
  // Sentence-ish chunks: requirement lists are usually bullets or lines.
  const sentences = text.split(/[.;!?\n•·*]|\s-\s/u);
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const bilingualOnly =
      /\bbilingual(?:ism)?\b|\bbilingue\b/u.test(sentence) &&
      blocksFrench &&
      !languages.some((l) => l.re.test(sentence));
    const matched = bilingualOnly
      ? { name: "French" }
      : languages.find((l) => l.re.test(sentence));
    if (!matched) continue;

    const optional =
      OPTIONAL_WORDS.test(sentence) || CONDITIONAL_WORDS.test(sentence);
    const mandatory =
      MANDATORY_BEFORE.test(sentence) ||
      MANDATORY_AFTER.test(sentence) ||
      MUST_SPEAK.test(sentence) ||
      new RegExp(
        `${languages.find((l) => l.name === matched.name)?.re.source ?? "french"}[- ]speaking`,
        "u",
      ).test(sentence);

    if (mandatory && !optional) {
      return {
        kind: "required",
        language: matched.name,
        reason: `requires ${matched.name}: '${snippet(sentence)}'`,
      };
    }
    if (mandatory || optional) asset = asset ?? matched.name;
  }

  return asset ? { kind: "asset", language: asset } : null;
}

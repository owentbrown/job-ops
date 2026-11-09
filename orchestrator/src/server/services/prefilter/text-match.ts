const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (entity) => {
      return HTML_ENTITIES[entity.toLowerCase()] ?? entity;
    })
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp>();

function keywordPattern(keyword: string): RegExp {
  const cached = patternCache.get(keyword);
  if (cached) return cached;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?:s)?(?![\\p{L}\\p{N}])`,
    "u",
  );
  patternCache.set(keyword, pattern);
  return pattern;
}

/**
 * Every whole-word occurrence of one keyword, with the normalized text that
 * precedes it (used for negation checks). Input text is normalized here.
 */
export function findKeywordOccurrences(
  text: string | null | undefined,
  keyword: string,
): { index: number; before: string }[] {
  const haystack = normalizeText(text);
  const needle = normalizeText(keyword);
  if (!haystack || !needle) return [];
  const global = new RegExp(keywordPattern(needle).source, "gu");
  return [...haystack.matchAll(global)].map((match) => ({
    index: match.index ?? 0,
    before: haystack.slice(0, match.index ?? 0),
  }));
}

/** First keyword (in list order) that appears as a whole word/phrase, else null. */
export function findKeyword(
  text: string | null | undefined,
  keywords: string[],
): string | null {
  const haystack = normalizeText(text);
  if (!haystack) return null;
  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (needle && keywordPattern(needle).test(haystack)) return keyword;
  }
  return null;
}

export function findKeywords(
  text: string | null | undefined,
  keywords: string[],
): string[] {
  const haystack = normalizeText(text);
  if (!haystack) return [];
  return keywords.filter((keyword) => {
    const needle = normalizeText(keyword);
    return needle.length > 0 && keywordPattern(needle).test(haystack);
  });
}

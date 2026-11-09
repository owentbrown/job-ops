export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
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
    `(^|[^a-z0-9])${escapeRegExp(keyword)}s?([^a-z0-9]|$)`,
  );
  patternCache.set(keyword, pattern);
  return pattern;
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

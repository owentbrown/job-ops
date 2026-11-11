import {
  findKeyword,
  findKeywordOccurrences,
  normalizeText,
} from "./text-match";

/** Words that put a location in the United States. */
const US_TERMS = [
  "united states",
  "united states of america",
  "usa",
  "u.s.a",
  "u.s",
  "us",
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "san francisco",
  "los angeles",
  "seattle",
  "chicago",
  "boston",
  "austin",
  "denver",
  "atlanta",
  "miami",
];

/**
 * Two-letter state codes after a comma ("Austin, TX"). Case-sensitive.
 * CA is left out on purpose: it is also used for Canada.
 */
const US_STATE_CODE =
  /,\s*(?:AL|AK|AZ|AR|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?![A-Za-z])/;

/** Words that mean Canada is (or could be) included. */
const CANADA_TERMS = [
  "canada",
  "canadian",
  "ontario",
  "quebec",
  "québec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "prince edward island",
  "yukon",
  "northwest territories",
  "nunavut",
  "toronto",
  "waterloo",
  "kitchener",
  "cambridge",
  "guelph",
  "hamilton",
  "london",
  "ottawa",
  "montreal",
  "montréal",
  "vancouver",
  "calgary",
  "edmonton",
  "winnipeg",
  "halifax",
  "victoria",
  "mississauga",
  "gta",
  "north america",
  "americas",
  "anywhere",
  "worldwide",
  "global",
  "international",
];

const CANADA_CODE =
  /,\s*(?:ON|BC|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU)(?![A-Za-z])/;

/** Phrases saying the job requires living in, or authorization for, the US. */
export const US_RESIDENCY_PHRASES = [
  "us residents only",
  "u.s. residents only",
  "must reside in the united states",
  "must reside in the u.s",
  "must reside in the us",
  "must live in the united states",
  "must be located in the united states",
  "must be located in the u.s",
  "must be based in the united states",
  "must be based in the u.s",
  "authorized to work in the united states",
  "authorized to work in the u.s",
  "authorized to work in the us",
  "us citizenship required",
  "u.s. citizenship required",
  "must be a us citizen",
  "must be a u.s. citizen",
];

/** True when the location names a Canadian place, or a region that includes Canada. */
export function locationIncludesCanada(
  location: string | null | undefined,
  extraCanadianPlaces: string[] = [],
): boolean {
  if (!location) return false;
  if (CANADA_CODE.test(location)) return true;
  return (
    findKeyword(location, [...CANADA_TERMS, ...extraCanadianPlaces]) !== null
  );
}

/**
 * True when the location names the United States and nothing that includes
 * Canada ("Chicago, Illinois, U.S. | Remote"). "United States or Canada" and
 * "North America" are not US-only.
 */
export function isUsOnlyLocation(
  location: string | null | undefined,
  extraCanadianPlaces: string[] = [],
): boolean {
  if (!location) return false;
  const usMentioned =
    US_STATE_CODE.test(location) || findKeyword(location, US_TERMS) !== null;
  return usMentioned && !locationIncludesCanada(location, extraCanadianPlaces);
}

/** True when the description mentions Canada at all (the AI check decides what it means). */
export function mentionsCanada(description: string): boolean {
  return findKeyword(description, ["canada", "canadian"]) !== null;
}

/** First US residency/authorization phrase in the description, or null. */
export function findUsResidencyPhrase(description: string): string | null {
  const text = normalizeText(description);
  for (const phrase of US_RESIDENCY_PHRASES) {
    if (findKeywordOccurrences(text, phrase).length > 0) return phrase;
  }
  return null;
}

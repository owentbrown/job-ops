import type { IndeedCompanyRow } from "@server/repositories/company-checks";
import { normalizeCompanyName } from "@shared/job-matching";
import type { CompanyIndeedFacts, CompanyReviewLink } from "@shared/types";

/** Only http(s) URLs are ever shown as links. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Indeed rating and company details for an employer, borrowed from any saved
 * job at the same company that came with them. When several listings have a
 * rating, the one based on the most reviews wins (then the newest).
 */
export function pickIndeedFacts(
  employer: string,
  rows: IndeedCompanyRow[],
): CompanyIndeedFacts | null {
  const key = normalizeCompanyName(employer ?? "");
  if (!key) return null;

  let best: IndeedCompanyRow | null = null;
  for (const row of rows) {
    if (normalizeCompanyName(row.employer ?? "") !== key) continue;
    if (!best) {
      best = row;
      continue;
    }
    const reviews = row.companyReviewsCount ?? -1;
    const bestReviews = best.companyReviewsCount ?? -1;
    if (
      reviews > bestReviews ||
      (reviews === bestReviews && row.discoveredAt > best.discoveredAt)
    ) {
      best = row;
    }
  }
  if (!best) return null;

  const indeedUrl = safeHttpUrl(best.employerUrl);
  return {
    rating: best.companyRating,
    reviewsCount: best.companyReviewsCount,
    indeedUrl:
      indeedUrl && new URL(indeedUrl).hostname.includes("indeed.")
        ? indeedUrl
        : null,
    website: safeHttpUrl(best.companyUrlDirect),
    employees: best.companyNumEmployees?.trim() || null,
    industry: best.companyIndustry?.trim() || null,
  };
}

/**
 * One-click searches for what employees say about a company. Canadian sites
 * where there is one, since that is where the search is focused.
 */
export function buildReviewLinks(
  employer: string,
  indeed: CompanyIndeedFacts | null,
): CompanyReviewLink[] {
  const name = (employer ?? "").trim();
  if (!name) return [];
  const q = encodeURIComponent(name);
  const google = (query: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  return [
    {
      label: "Glassdoor",
      url: `https://www.glassdoor.ca/Search/results.htm?keyword=${q}`,
    },
    {
      label: "Indeed",
      url: indeed?.indeedUrl
        ? `${indeed.indeedUrl.replace(/\/+$/, "")}/reviews`
        : `https://ca.indeed.com/companies/search?q=${q}`,
    },
    { label: "Blind", url: google(`site:teamblind.com "${name}"`) },
    {
      label: "Reddit",
      url: google(`site:reddit.com "${name}" working at OR culture OR layoffs`),
    },
    {
      label: "News",
      url: google(`"${name}" layoffs OR funding OR acquisition`),
    },
  ];
}

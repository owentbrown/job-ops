import type { PrefilterConfig } from "./config";
import { normalizeText } from "./text-match";
import type { PrefilterJob } from "./types";

type SalaryInterval =
  | "hourly"
  | "daily"
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "yearly";

export type ParsedSalary = {
  max: number;
  interval: SalaryInterval | null;
  currency: string | null;
};

export type SalaryCheck = {
  annualMaxCad: number | null;
  belowFloor: boolean;
  detail: string;
};

const NO_DECISION: SalaryCheck = {
  annualMaxCad: null,
  belowFloor: false,
  detail: "no usable salary",
};

function intervalFromWords(value: string): SalaryInterval | null {
  if (/semi[- ]?month/.test(value)) return "semimonthly";
  if (/bi[- ]?week|fortnight/.test(value)) return "biweekly";
  return null;
}

export function normalizeInterval(
  raw: string | null | undefined,
): SalaryInterval | null {
  const value = normalizeText(raw);
  if (!value) return null;
  const special = intervalFromWords(value);
  if (special) return special;
  if (/hour/.test(value)) return "hourly";
  if (/day|daily/.test(value)) return "daily";
  if (/week/.test(value)) return "weekly";
  if (/month/.test(value)) return "monthly";
  if (/year|annual|annum/.test(value)) return "yearly";
  return null;
}

function currencyFromText(text: string): string | null {
  if (/us\$|\busd\b/.test(text)) return "USD";
  if (/ca\$|c\$|\bcad\b/.test(text)) return "CAD";
  if (/£|\bgbp\b/.test(text)) return "GBP";
  if (/€|\beur\b/.test(text)) return "EUR";
  return null;
}

function intervalFromText(text: string): SalaryInterval | null {
  const special = intervalFromWords(text);
  if (special) return special;
  if (/\/\s*(hr|hour|h)\b|per hour|an hour|hourly/.test(text)) return "hourly";
  if (/per day|a day|\/\s*day|daily/.test(text)) return "daily";
  if (/per week|a week|\/\s*(wk|week)|weekly/.test(text)) return "weekly";
  if (/per month|a month|\/\s*(mo|month)|monthly/.test(text)) return "monthly";
  if (/per year|a year|\/\s*(yr|year)|annual|annum|yearly/.test(text)) {
    return "yearly";
  }
  return null;
}

const AMOUNT =
  /(?<![\p{L}\p{N}])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)([km])?(?![\p{L}\p{N}])(?!\s*(?:million|billion|thousand)\b)/gu;

/** Conservative free-text parse. Only runs when a currency marker is present. */
export function parseSalaryText(
  text: string | null | undefined,
): ParsedSalary | null {
  const value = normalizeText(text);
  if (!value || !/[$£€]|\b(cad|usd|gbp|eur)\b/.test(value)) return null;
  const amounts: number[] = [];
  for (const match of value.matchAll(AMOUNT)) {
    let amount = Number(match[1].replace(/,/g, ""));
    if (match[2] === "k") amount *= 1000;
    if (match[2] === "m") amount *= 1_000_000;
    if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
  }
  if (amounts.length === 0) return null;
  return {
    max: Math.max(...amounts),
    interval: intervalFromText(value),
    currency: currencyFromText(value),
  };
}

/**
 * True when the text states only a floor ("$90,000+", "from $90k", "OTE",
 * "plus commission") and has neither an explicit range nor "up to".
 */
function isOpenEnded(text: string | null | undefined): boolean {
  const value = normalizeText(text);
  if (!value) return false;
  if (/\bup to\b/.test(value)) return false;
  if (
    /\d[km]?\+?\s*(-|\bto\b)\s*[$£€]?\s*(cad|usd|gbp|eur)?\s*\d/.test(value)
  ) {
    return false;
  }
  return (
    /\d[km]?\s*\+/.test(value) ||
    /\b(from|starting|minimum|at least|ote|plus commission)\b/.test(value)
  );
}

const CANADA_WORDS =
  /\b(canada|ontario|british columbia|alberta|quebec|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island)\b/;
const CANADA_CODE = /,\s*(on|bc|ab|qc|mb|sk|ns|nb|nl|pe)\s*(,|\(|$)/;
const US_WORDS = /united states|\busa\b|\bu\.s\.|,\s*us\b/;
const US_STATE_CODE =
  /,\s*(al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\s*(,|\(|$)/;

export function isClearlyCanadian(
  location: string | null | undefined,
): boolean {
  const value = normalizeText(location);
  if (!value) return false;
  if (!CANADA_WORDS.test(value) && !CANADA_CODE.test(value)) return false;
  return !(US_WORDS.test(value) || US_STATE_CODE.test(value));
}

function multiplier(interval: SalaryInterval, hoursPerYear: number): number {
  switch (interval) {
    case "hourly":
      return hoursPerYear;
    case "daily":
      return 260;
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "semimonthly":
      return 24;
    case "monthly":
      return 12;
    case "yearly":
      return 1;
  }
}

function pickSalary(
  job: PrefilterJob,
): (ParsedSalary & { source: string }) | null {
  if (typeof job.salaryMaxAmount === "number" && job.salaryMaxAmount > 0) {
    const text = normalizeText(job.salary);
    return {
      max: job.salaryMaxAmount,
      interval: normalizeInterval(job.salaryInterval) ?? intervalFromText(text),
      currency:
        job.salaryCurrency?.trim().toUpperCase() || currencyFromText(text),
      source: "structured",
    };
  }
  if (isOpenEnded(job.salary)) return null;
  const parsed = parseSalaryText(job.salary);
  return parsed ? { ...parsed, source: `"${job.salary}"` } : null;
}

/**
 * Explicit currency is used as-is. Clearly Canadian locations use CAD. In every
 * other case the most generous configured rate (CAD, USD, default) is used so
 * ambiguity never causes a drop.
 */
function resolveRate(
  explicit: string | null,
  job: PrefilterJob,
  config: PrefilterConfig["salary"],
): { currency: string; rate: number } | null {
  if (explicit) {
    const rate = config.ratesToCad[explicit];
    return rate === undefined ? null : { currency: explicit, rate };
  }
  if (isClearlyCanadian(job.location)) {
    const rate = config.ratesToCad.CAD;
    return rate === undefined ? null : { currency: "CAD", rate };
  }
  let best: { currency: string; rate: number } | null = null;
  for (const currency of new Set(["CAD", "USD", config.defaultCurrency])) {
    const rate = config.ratesToCad[currency];
    if (rate !== undefined && (!best || rate > best.rate)) {
      best = { currency, rate };
    }
  }
  return best;
}

export function evaluateSalary(
  job: PrefilterJob,
  config: PrefilterConfig["salary"],
): SalaryCheck {
  if (!config.enabled) return NO_DECISION;

  const picked = pickSalary(job);
  if (!picked) return NO_DECISION;
  const { max, currency, source } = picked;
  let { interval } = picked;

  if (!interval) {
    if (max >= 30000) interval = "yearly";
    else if (max < 200) interval = "hourly";
    else return NO_DECISION;
  }

  const resolved = resolveRate(currency, job, config);
  if (!resolved) return NO_DECISION;

  const annualMaxCad = Math.round(
    max * multiplier(interval, config.hoursPerYear) * resolved.rate,
  );
  return {
    annualMaxCad,
    belowFloor: annualMaxCad < config.floorAnnualCad,
    detail: `${source} ≈ $${Math.round(annualMaxCad / 1000)}K CAD/yr (${interval}, ${resolved.currency})`,
  };
}

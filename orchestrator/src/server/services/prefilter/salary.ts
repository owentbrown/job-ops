import type { PrefilterConfig } from "./config";
import { normalizeText } from "./text-match";
import type { PrefilterJob } from "./types";

type SalaryInterval = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

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

export function normalizeInterval(
  raw: string | null | undefined,
): SalaryInterval | null {
  const value = normalizeText(raw);
  if (!value) return null;
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
  if (/\/\s*(hr|hour|h)\b|per hour|an hour|hourly/.test(text)) return "hourly";
  if (/per day|a day|\/\s*day|daily/.test(text)) return "daily";
  if (/per week|a week|\/\s*(wk|week)|weekly/.test(text)) return "weekly";
  if (/per month|a month|\/\s*(mo|month)|monthly/.test(text)) return "monthly";
  if (/per year|a year|\/\s*(yr|year)|annual|annum|yearly/.test(text))
    return "yearly";
  return null;
}

/** Conservative free-text parse. Only runs when a currency marker is present. */
export function parseSalaryText(
  text: string | null | undefined,
): ParsedSalary | null {
  const value = normalizeText(text);
  if (!value || !/[$£€]|\b(cad|usd|gbp|eur)\b/.test(value)) return null;
  const amounts: number[] = [];
  for (const match of value.matchAll(
    /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/g,
  )) {
    let amount = Number(match[1].replace(/,/g, ""));
    if (match[2]) amount *= 1000;
    if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
  }
  if (amounts.length === 0) return null;
  return {
    max: Math.max(...amounts),
    interval: intervalFromText(value),
    currency: currencyFromText(value),
  };
}

export function inferCurrencyFromLocation(
  location: string | null | undefined,
): string | null {
  const value = normalizeText(location);
  if (!value) return null;
  if (
    /canada|ontario|british columbia|alberta|quebec|\b(on|bc|ab|qc|mb|sk|ns|nb|nl|pe)\b/.test(
      value,
    )
  ) {
    return "CAD";
  }
  if (/united states|\busa\b|\bu\.s\.|, us\b/.test(value)) return "USD";
  return null;
}

function multiplier(interval: SalaryInterval, hoursPerYear: number): number {
  switch (interval) {
    case "hourly":
      return hoursPerYear;
    case "daily":
      return 260;
    case "weekly":
      return 52;
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
    return {
      max: job.salaryMaxAmount,
      interval: normalizeInterval(job.salaryInterval),
      currency: job.salaryCurrency?.trim().toUpperCase() || null,
      source: "structured",
    };
  }
  const parsed = parseSalaryText(job.salary);
  return parsed ? { ...parsed, source: `"${job.salary}"` } : null;
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
    if (max >= 10000) interval = "yearly";
    else if (max < 200) interval = "hourly";
    else return NO_DECISION;
  }

  const resolvedCurrency =
    currency ??
    inferCurrencyFromLocation(job.location) ??
    config.defaultCurrency;
  const rate = config.ratesToCad[resolvedCurrency];
  if (rate === undefined) return NO_DECISION;

  const annualMaxCad = Math.round(
    max * multiplier(interval, config.hoursPerYear) * rate,
  );
  return {
    annualMaxCad,
    belowFloor: annualMaxCad < config.floorAnnualCad,
    detail: `${source} ≈ $${Math.round(annualMaxCad / 1000)}K CAD/yr (${interval}, ${resolvedCurrency})`,
  };
}

/** Helpers for the Spend page (fork: spend). */

export const FEATURE_LABELS: Record<string, string> = {
  scoring: "Scoring",
  title_check: "AI title check",
  tailoring: "Resume tailoring",
  project_selection: "Project selection",
  cover_letter: "Cover letters",
  chat: "Job chat",
  manual_job: "Manual job import",
  search_plan: "Search planning",
  search_terms: "Search term ideas",
  resume_suggestion: "Resume suggestions",
  email_triage: "Email triage",
  profile_skills: "Profile skill refresh",
  profile_writing: "Profile writing",
  other: "Other",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/**
 * Dollar amounts. Single AI calls cost fractions of a cent, so small values
 * keep extra precision instead of rounding to "$0.00".
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs >= 0.01) {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (abs < 0.0001) return "<$0.0001";
  return `$${value.toFixed(4)}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

export type SpendPeriod = "today" | "7d" | "30d" | "month" | "all";

export const PERIOD_LABELS: Record<SpendPeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  all: "All time",
};

/** Start of the period in local time, as an ISO string (null = no limit). */
export function periodStart(
  period: SpendPeriod,
  now = new Date(),
): string | null {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  switch (period) {
    case "today":
      return startOfToday.toISOString();
    case "7d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 6);
      return d.toISOString();
    }
    case "30d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 29);
      return d.toISOString();
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case "all":
      return null;
  }
}

export type JobSpendFilter =
  | "all"
  | "applied"
  | "ready"
  | "discovered"
  | "skipped";

export const JOB_FILTER_LABELS: Record<JobSpendFilter, string> = {
  all: "All jobs",
  applied: "Applied",
  ready: "Ready to apply",
  discovered: "Not yet reviewed",
  skipped: "Skipped / filtered",
};

export function matchesJobFilter(
  status: string | null,
  filter: JobSpendFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "applied":
      return status === "applied" || status === "in_progress";
    case "ready":
      return status === "ready" || status === "processing";
    case "discovered":
      return status === "discovered";
    case "skipped":
      return status === "skipped" || status === "expired";
  }
}

export const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  processing: "Processing",
  ready: "Ready",
  applied: "Applied",
  in_progress: "In progress",
  skipped: "Skipped",
  expired: "Expired",
};

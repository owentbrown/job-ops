import { normalizeSearchTerms } from "../utils/search-terms";

export const ROLE_CATEGORY_OTHER = "Other";

/** One-click reasons offered when skipping a job. */
export const SKIP_CATEGORIES = [
  "Wrong role",
  "Seniority",
  "Location / remote",
  "Salary",
  "Company",
  "Not interested",
] as const;
export type SkipCategoryChoice = (typeof SKIP_CATEGORIES)[number];

/** Stored when the user skipped without picking a reason. System skips stay NULL. */
export const SKIP_CATEGORY_UNSPECIFIED = "unspecified";

/** Values the skip catch-up pass may assign. */
export const SKIP_BACKFILL_CATEGORIES = [...SKIP_CATEGORIES, "Other"] as const;

/** The role categories offered to the AI: the user's search terms plus "Other". */
export function roleCategoryOptions(searchTerms: readonly string[]): string[] {
  const terms = normalizeSearchTerms([...searchTerms]).filter(
    (t) => t.toLowerCase() !== ROLE_CATEGORY_OTHER.toLowerCase(),
  );
  return [...terms, ROLE_CATEGORY_OTHER];
}

export type BackfillKind = "roles" | "skips";

export interface BackfillEstimate {
  kind: BackfillKind;
  /** Jobs the pass would categorize. */
  count: number;
  /** AI calls (batches). */
  calls: number;
  /** Estimated cost in USD, or null when the model has no price. */
  estimatedCost: number | null;
}

export interface BackfillResult {
  kind: BackfillKind;
  categorized: number;
  failedBatches: number;
}

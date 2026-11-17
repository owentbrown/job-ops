import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import * as jobsRepo from "@server/repositories/jobs";
import {
  getPrivateCloudflareCookieStorageDir,
  getPrivateDataScope,
} from "@server/tenancy/private-scope";
import type { Job, JobStatus } from "@shared/types";
import { parseHiringCafeJobDetailPage } from "hiringcafe-extractor/src/run";
import { readHiringCafeBrowserPage } from "./hiring-cafe-browser";

/**
 * Hiring Cafe's search results carry only a short requirements summary; the
 * full description is on the job's own page, which the search sometimes
 * can't read (rate limits, bot checks). Anything shorter than this is taken
 * to be that summary.
 */
export const SUMMARY_ONLY_MAX_CHARS = 800;

const DETAIL_BASE_URL = "https://hiringcafe.com/job/";
const BACKFILL_LIMIT = 15;
const BACKFILL_GAP_MS = 2000;

/** Jobs you've applied to first, then ones to apply to, then to review. */
const BACKFILL_STATUS_ORDER: JobStatus[] = [
  "in_progress",
  "applied",
  "ready",
  "discovered",
];

export type DescriptionRefreshResult =
  | "updated"
  | "challenged"
  | "unavailable"
  | "not_needed";

export function needsFullHiringCafeDescription(
  job: Pick<Job, "source" | "jobDescription">,
): boolean {
  return (
    job.source === "hiringcafe" &&
    (job.jobDescription?.trim().length ?? 0) < SUMMARY_ONLY_MAX_CHARS
  );
}

function extractDescription(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const info = (raw as { job_information?: unknown }).job_information;
  if (!info || typeof info !== "object") return null;
  const description = (info as { description?: unknown }).description;
  return typeof description === "string" && description.trim()
    ? description.trim()
    : null;
}

/** Reads the job's Hiring Cafe page and saves its full description. */
export async function refreshHiringCafeDescription(
  job: Job,
): Promise<DescriptionRefreshResult> {
  if (!needsFullHiringCafeDescription(job) || !job.sourceJobId) {
    return "not_needed";
  }
  const url = `${DETAIL_BASE_URL}${encodeURIComponent(job.sourceJobId)}`;
  const page = await readHiringCafeBrowserPage(
    getPrivateDataScope().scopeKey,
    getPrivateCloudflareCookieStorageDir(),
    url,
  );
  if (page.challenged) return "challenged";
  if (page.status >= 400) return "unavailable";

  let description: string | null;
  try {
    description = extractDescription(
      parseHiringCafeJobDetailPage(page.html, url, page.status),
    );
  } catch {
    return "unavailable";
  }
  const current = job.jobDescription?.trim() ?? "";
  if (!description || description.length <= current.length) {
    return "unavailable";
  }

  await jobsRepo.updateJob(job.id, { jobDescription: description });
  // A To-apply CV was built from the summary; rebuild it from the full text.
  if (job.status === "ready" && job.pdfSource === "generated") {
    const { enqueueAutoPdfRegenerationForJob } = await import(
      "./auto-pdf-regeneration"
    );
    await enqueueAutoPdfRegenerationForJob({
      jobId: job.id,
      reason: "tailoring_updated",
      requestedBy: "system",
    });
  }
  return "updated";
}

/**
 * After a search: fetch full descriptions for Hiring Cafe jobs that only got
 * the summary, most important first. Stops at the first bot check (the next
 * search tries again) or when a search starts.
 */
export async function backfillHiringCafeDescriptions(options: {
  shouldStop: () => boolean;
  limit?: number;
  gapMs?: number;
}): Promise<{ updated: number; tried: number }> {
  const limit = options.limit ?? BACKFILL_LIMIT;
  const gapMs = options.gapMs ?? BACKFILL_GAP_MS;
  const candidates = (await jobsRepo.getAllJobs(BACKFILL_STATUS_ORDER))
    .filter(needsFullHiringCafeDescription)
    .sort(
      (a, b) =>
        BACKFILL_STATUS_ORDER.indexOf(a.status) -
          BACKFILL_STATUS_ORDER.indexOf(b.status) ||
        (b.suitabilityScore ?? -1) - (a.suitabilityScore ?? -1),
    )
    .slice(0, limit);

  let updated = 0;
  let tried = 0;
  for (const job of candidates) {
    if (options.shouldStop()) break;
    if (tried > 0 && gapMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    tried += 1;
    try {
      const result = await refreshHiringCafeDescription(job);
      if (result === "updated") updated += 1;
      if (result === "challenged") break;
    } catch (error) {
      logger.warn("Hiring Cafe description fetch failed", {
        jobId: job.id,
        error: sanitizeUnknown(error),
      });
      break;
    }
  }

  if (tried > 0) {
    logger.info("Hiring Cafe full descriptions fetched", { tried, updated });
  }
  return { updated, tried };
}

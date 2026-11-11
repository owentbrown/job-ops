import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import {
  deduplicateJobsByTitleAndEmployer,
  normalizeCompanyName,
  normalizeJobTitle,
} from "@shared/job-matching.js";
import type { CreateJobInput } from "@shared/types";
import { progressHelpers } from "../progress";

/** Only jobs found this recently count as "already seen" for repost matching. */
export const REPOST_WINDOW_DAYS = 60;

function repostKey(title: string, employer: string): string | null {
  const t = normalizeJobTitle(title ?? "");
  const e = normalizeCompanyName(employer ?? "");
  return t && e ? `${t}\u0000${e}` : null;
}

/**
 * Drop discovered jobs whose normalised title + employer exactly match a job
 * already saved in the last REPOST_WINDOW_DAYS (a repost, or the same role on
 * another board). Exact match only: a wrongly dropped job costs more than a
 * duplicate, so near-misses still come through.
 */
async function dropReposts(
  discovered: CreateJobInput[],
): Promise<{ kept: CreateJobInput[]; reposts: number }> {
  if (discovered.length === 0) return { kept: discovered, reposts: 0 };
  const since = new Date(
    Date.now() - REPOST_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const existing = await jobsRepo.getTitleEmployerPairsSince(since);
  const seen = new Set<string>();
  for (const row of existing) {
    const key = repostKey(row.title, row.employer);
    if (key) seen.add(key);
  }
  if (seen.size === 0) return { kept: discovered, reposts: 0 };

  // Same URL as a saved job is handled (and counted) by createJobs.
  const savedUrls = new Set(await jobsRepo.getAllJobUrls());
  const kept: CreateJobInput[] = [];
  let reposts = 0;
  for (const job of discovered) {
    const key = repostKey(job.title, job.employer);
    if (key && seen.has(key) && !savedUrls.has(job.jobUrl)) {
      reposts += 1;
      continue;
    }
    kept.push(job);
  }
  return { kept, reposts };
}

export async function importJobsStep(args: {
  discoveredJobs: CreateJobInput[];
}): Promise<{
  created: number;
  skipped: number;
  fuzzyMerged: number;
  repostsSkipped: number;
}> {
  logger.info("Importing discovered jobs", {
    discovered: args.discoveredJobs.length,
  });

  const dedupedJobs = deduplicateJobsByTitleAndEmployer(args.discoveredJobs);
  const fuzzyMerged = args.discoveredJobs.length - dedupedJobs.length;

  if (fuzzyMerged > 0) {
    logger.info("Fuzzy-deduped discovered jobs before import", {
      original: args.discoveredJobs.length,
      dedupedCount: dedupedJobs.length,
      fuzzyMerged,
    });
  }

  const { kept, reposts: repostsSkipped } = await dropReposts(dedupedJobs);
  if (repostsSkipped > 0) {
    logger.info("Skipped reposts of already-saved jobs", {
      repostsSkipped,
      windowDays: REPOST_WINDOW_DAYS,
    });
  }

  const { created, skipped } = await jobsRepo.createJobs(
    kept,
    (job, index, total) =>
      progressHelpers.importingJob(index, total, {
        id: job.jobUrl,
        title: job.title,
        employer: job.employer,
      }),
  );
  logger.info("Import step complete", {
    discovered: args.discoveredJobs.length,
    fuzzyMerged,
    created,
    skipped,
    repostsSkipped,
  });

  progressHelpers.importComplete(
    created,
    skipped + fuzzyMerged + repostsSkipped,
  );

  return { created, skipped, fuzzyMerged, repostsSkipped };
}

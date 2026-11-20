import {
  calculateSimilarity,
  canonicalJobUrl,
  normalizeCompanyName,
  normalizeJobTitle,
} from "@shared/job-matching";
import type { JobStatus, RelatedJob } from "@shared/types";

/** The most rows the "Other roles at this company" panel shows. */
export const RELATED_JOBS_LIMIT = 50;

type RelatableJob = {
  id: string;
  title: string;
  employer: string;
  jobUrl: string;
  status: JobStatus;
  outcome: string | null;
  appliedAt: string | null;
  discoveredAt: string;
};

/** Jobs you acted on sort ahead of ones you only saw. */
const STATUS_RANK: Record<JobStatus, number> = {
  in_progress: 0,
  applied: 1,
  ready: 2,
  processing: 3,
  discovered: 4,
  skipped: 5,
  expired: 6,
};

function latestTimestamp(job: RelatableJob): number {
  const value = Date.parse(job.appliedAt ?? job.discoveredAt);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Other saved jobs at the same company (company names compared without legal
 * endings such as "Inc." or "AG"), plus any job with the same posting link.
 * Same-posting matches come first, then applied / in-progress jobs, then the
 * rest; newest first within each group.
 */
export function findRelatedJobs(
  job: RelatableJob,
  candidates: RelatableJob[],
  limit = RELATED_JOBS_LIMIT,
): RelatedJob[] {
  const employer = normalizeCompanyName(job.employer ?? "");
  const url = canonicalJobUrl(job.jobUrl ?? "");
  const title = normalizeJobTitle(job.title ?? "");

  const related: Array<RelatedJob & { sortTime: number }> = [];
  for (const candidate of candidates) {
    if (candidate.id === job.id) continue;
    const samePosting =
      Boolean(url) && canonicalJobUrl(candidate.jobUrl ?? "") === url;
    const sameEmployer =
      Boolean(employer) &&
      normalizeCompanyName(candidate.employer ?? "") === employer;
    if (!samePosting && !sameEmployer) continue;

    related.push({
      id: candidate.id,
      title: candidate.title,
      employer: candidate.employer,
      status: candidate.status,
      outcome: candidate.outcome,
      appliedAt: candidate.appliedAt,
      discoveredAt: candidate.discoveredAt,
      samePosting,
      titleSimilarity: Math.round(
        calculateSimilarity(title, normalizeJobTitle(candidate.title ?? "")),
      ),
      sortTime: latestTimestamp(candidate),
    });
  }

  related.sort(
    (a, b) =>
      Number(b.samePosting) - Number(a.samePosting) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.sortTime - a.sortTime,
  );

  return related
    .slice(0, limit)
    .map(({ sortTime: _sortTime, ...rest }) => rest);
}

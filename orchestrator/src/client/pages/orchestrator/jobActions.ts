import type { JobActionResponse, JobListItem } from "@shared/types";

/** A job the pre-score filter removed (and the user hasn't restored). */
export function isFilteredOutJob(
  job: Pick<JobListItem, "status" | "filterLayer">,
): boolean {
  return (
    job.status === "skipped" &&
    (job.filterLayer === "rules" || job.filterLayer === "llm")
  );
}

const SKIPPABLE_STATUSES = new Set(["discovered", "ready"]);

export function canSkip(jobs: JobListItem[]): boolean {
  return (
    jobs.length > 0 && jobs.every((job) => SKIPPABLE_STATUSES.has(job.status))
  );
}

export function canMoveToReady(jobs: JobListItem[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.status === "discovered");
}

export function canRescore(jobs: JobListItem[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.status !== "processing");
}

export function getFailedJobIds(response: JobActionResponse): Set<string> {
  const failedIds = response.results
    .filter((result) => !result.ok)
    .map((result) => result.jobId);
  return new Set(failedIds);
}

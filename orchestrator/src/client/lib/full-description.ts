import type { DescriptionRefreshResult } from "@client/api";
import type { Job } from "@shared/types.js";

/** Hiring Cafe jobs saved with only a short summary (matches the server). */
export function needsFullDescription(
  job: Pick<Job, "source" | "jobDescription">,
): boolean {
  return (
    job.source === "hiringcafe" &&
    (job.jobDescription?.trim().length ?? 0) < 800
  );
}

export const descriptionRefreshMessages: Record<
  DescriptionRefreshResult,
  string
> = {
  updated: "Full description saved",
  challenged:
    "Hiring Cafe asked for a bot check. Try again later; searches also retry this.",
  unavailable: "Hiring Cafe doesn't have a longer description for this job.",
  not_needed: "This job already has its full description.",
};

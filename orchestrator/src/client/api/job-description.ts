import type { Job } from "@shared/types.js";
import { fetchApi } from "./core";

export type DescriptionRefreshResult =
  | "updated"
  | "challenged"
  | "unavailable"
  | "not_needed";

export function refreshJobDescription(
  jobId: string,
): Promise<{ result: DescriptionRefreshResult; job: Job }> {
  return fetchApi(`/jobs/${encodeURIComponent(jobId)}/refresh-description`, {
    method: "POST",
  });
}

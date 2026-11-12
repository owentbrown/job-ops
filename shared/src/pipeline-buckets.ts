import type { ApplicationStage, JobOutcome } from "./types/jobs";

/** Display buckets for an application, in pipeline order. */
export const PIPELINE_BUCKETS = [
  "awaiting",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;

export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_BUCKET_LABELS: Record<PipelineBucket, string> = {
  awaiting: "Awaiting reply",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

/**
 * Which bucket an application belongs in. Returns null for withdrawn
 * applications, which are left out of the pipeline. Ghosted / no response
 * count as still awaiting a reply (the user does not follow up).
 */
export function bucketFor(
  stage: ApplicationStage,
  outcome: JobOutcome | null,
): PipelineBucket | null {
  switch (stage) {
    case "applied":
      return "awaiting";
    case "screening":
      return "screening";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "closed":
      if (outcome === "withdrawn") return null;
      if (outcome === "ghosted" || outcome === "no_response") return "awaiting";
      if (outcome === "offer_accepted" || outcome === "offer_declined") {
        return "offer";
      }
      return "rejected";
  }
}

/** The stage transition a board drop into `bucket` should make. */
export function transitionForBucket(bucket: PipelineBucket): {
  toStage: ApplicationStage;
  outcome: JobOutcome | null;
} {
  switch (bucket) {
    case "awaiting":
      return { toStage: "applied", outcome: null };
    case "screening":
      return { toStage: "screening", outcome: null };
    case "interview":
      return { toStage: "interview", outcome: null };
    case "offer":
      return { toStage: "offer", outcome: null };
    case "rejected":
      return { toStage: "closed", outcome: "rejected" };
  }
}

import { describe, expect, it } from "vitest";
import {
  bucketFor,
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
  transitionForBucket,
} from "./pipeline-buckets";
import { APPLICATION_STAGES, LEGACY_STAGE_MAP } from "./types/jobs";

describe("APPLICATION_STAGES", () => {
  it("is the five-stage model", () => {
    expect(APPLICATION_STAGES).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "closed",
    ]);
  });

  it("maps every legacy stage to a current stage", () => {
    expect(LEGACY_STAGE_MAP).toEqual({
      recruiter_screen: "screening",
      assessment: "screening",
      hiring_manager_screen: "screening",
      technical_interview: "interview",
      onsite: "interview",
    });
  });
});

describe("PIPELINE_BUCKETS", () => {
  it("has five buckets in display order with labels", () => {
    expect(PIPELINE_BUCKETS).toEqual([
      "awaiting",
      "screening",
      "interview",
      "offer",
      "rejected",
    ]);
    expect(PIPELINE_BUCKET_LABELS).toEqual({
      awaiting: "Awaiting reply",
      screening: "Screening",
      interview: "Interview",
      offer: "Offer",
      rejected: "Rejected",
    });
  });
});

describe("bucketFor", () => {
  it.each([
    ["applied", null, "awaiting"],
    ["screening", null, "screening"],
    ["interview", null, "interview"],
    ["offer", null, "offer"],
    ["closed", "rejected", "rejected"],
    ["closed", "ghosted", "awaiting"],
    ["closed", "no_response", "awaiting"],
    ["closed", "offer_accepted", "offer"],
    ["closed", "offer_declined", "offer"],
    ["closed", null, "rejected"],
  ] as const)("%s + %s -> %s", (stage, outcome, expected) => {
    expect(bucketFor(stage, outcome)).toBe(expected);
  });

  it("leaves withdrawn applications out", () => {
    expect(bucketFor("closed", "withdrawn")).toBeNull();
  });

  it("ignores an outcome on a stage that is not closed", () => {
    expect(bucketFor("interview", "rejected")).toBe("interview");
  });
});

describe("transitionForBucket", () => {
  it.each([
    ["awaiting", { toStage: "applied", outcome: null }],
    ["screening", { toStage: "screening", outcome: null }],
    ["interview", { toStage: "interview", outcome: null }],
    ["offer", { toStage: "offer", outcome: null }],
    ["rejected", { toStage: "closed", outcome: "rejected" }],
  ] as const)("%s", (bucket, expected) => {
    expect(transitionForBucket(bucket)).toEqual(expected);
  });
});

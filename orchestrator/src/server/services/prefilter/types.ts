import type { Job } from "@shared/types";

/** The job fields the prefilter reads. Full Job objects satisfy this. */
export type PrefilterJob = Pick<
  Job,
  | "id"
  | "title"
  | "employer"
  | "location"
  | "isRemote"
  | "workFromHomeType"
  | "salary"
  | "salaryMaxAmount"
  | "salaryInterval"
  | "salaryCurrency"
  | "jobDescription"
>;

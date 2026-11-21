import { z } from "zod";

export const EXTRACTOR_SOURCE_IDS = [
  "gradcracker",
  "indeed",
  "linkedin",
  "glassdoor",
  "ukvisajobs",
  "adzuna",
  "hiringcafe",
  "startupjobs",
  "workingnomads",
  "golangjobs",
  "jobindex",
  "seek",
  "naukri",
  "fiveamsat",
  "wazzuf",
  "freehire",
  "manual",
] as const;

export type ExtractorSourceId = (typeof EXTRACTOR_SOURCE_IDS)[number];

export interface ExtractorSourceMetadata {
  label: string;
  order: number;
  category: "pipeline" | "manual";
  requiresCredentials?: boolean;
  ukOnly?: boolean;
  /**
   * Left out of this fork's source pickers and settings. The extractor still
   * works; flip this off to bring a source back.
   */
  hidden?: boolean;
}

export const EXTRACTOR_SOURCE_METADATA: Record<
  ExtractorSourceId,
  ExtractorSourceMetadata
> = {
  gradcracker: {
    label: "Gradcracker",
    order: 10,
    category: "pipeline",
    ukOnly: true,
    hidden: true,
  },
  indeed: { label: "Indeed", order: 20, category: "pipeline" },
  linkedin: { label: "LinkedIn", order: 30, category: "pipeline" },
  glassdoor: { label: "Glassdoor", order: 40, category: "pipeline", hidden: true },
  ukvisajobs: {
    label: "UK Visa Jobs",
    order: 50,
    category: "pipeline",
    requiresCredentials: true,
    ukOnly: true,
    hidden: true,
  },
  adzuna: {
    label: "Adzuna",
    order: 60,
    category: "pipeline",
    requiresCredentials: true,
    hidden: true,
  },
  hiringcafe: { label: "Hiring Cafe", order: 70, category: "pipeline" },
  startupjobs: { label: "startup.jobs", order: 80, category: "pipeline" },
  workingnomads: {
    label: "Working Nomads",
    order: 90,
    category: "pipeline",
  },
  golangjobs: {
    label: "Golang Jobs",
    order: 100,
    category: "pipeline",
    hidden: true,
  },
  jobindex: {
    label: "Jobindex",
    order: 103,
    category: "pipeline",
    hidden: true,
  },
  seek: {
    label: "Seek",
    order: 105,
    category: "pipeline",
    requiresCredentials: true,
    hidden: true,
  },
  naukri: {
    label: "Naukri",
    order: 107,
    category: "pipeline",
    hidden: true,
  },
  fiveamsat: { label: "Khamsat", order: 109, category: "pipeline", hidden: true },
  wazzuf: { label: "WUZZUF", order: 110, category: "pipeline", hidden: true },
  freehire: { label: "FreeHire", order: 115, category: "pipeline" },
  manual: { label: "Manual", order: 120, category: "manual" },
};

/** Pipeline sources this fork offers in its pickers (hidden ones left out). */
export const VISIBLE_PIPELINE_SOURCE_IDS = EXTRACTOR_SOURCE_IDS.filter(
  (source) =>
    EXTRACTOR_SOURCE_METADATA[source].category === "pipeline" &&
    !EXTRACTOR_SOURCE_METADATA[source].hidden,
);

export const PIPELINE_EXTRACTOR_SOURCE_IDS = EXTRACTOR_SOURCE_IDS.filter(
  (source) => EXTRACTOR_SOURCE_METADATA[source].category === "pipeline",
);

const extractorSourceTuple = EXTRACTOR_SOURCE_IDS as unknown as [
  ExtractorSourceId,
  ...ExtractorSourceId[],
];

export const extractorSourceEnum = z.enum(extractorSourceTuple);

export function isExtractorSourceId(value: string): value is ExtractorSourceId {
  return EXTRACTOR_SOURCE_IDS.includes(value as ExtractorSourceId);
}

export function sourceLabel(source: ExtractorSourceId): string {
  return EXTRACTOR_SOURCE_METADATA[source].label;
}

export function sortSources<T extends { source: ExtractorSourceId }>(
  values: T[],
): T[] {
  return [...values].sort(
    (left, right) =>
      EXTRACTOR_SOURCE_METADATA[left.source].order -
      EXTRACTOR_SOURCE_METADATA[right.source].order,
  );
}

import type { PrefilterLayer } from "@shared/types.js";
import { fetchApi } from "./core";

export type FilteredJob = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  salary: string | null;
  jobUrl: string;
  filterReason: string | null;
  filterLayer: PrefilterLayer | null;
  filteredAt: string | null;
  discoveredAt: string;
};

/** Mirrors the server Zod schema in services/prefilter/config.ts. */
export type PrefilterConfigDto = {
  _comment?: string;
  enabled: boolean;
  pauseBeforeScoring: boolean;
  title: { _comment?: string; include: string[]; exclude: string[] };
  companyBlocklist: string[];
  maxPostingAgeDays?: number | null;
  location: {
    _comment?: string;
    commuteBlocklist: string[];
    dropUsOnly: boolean;
  };
  companyNotes: Array<{ company: string; note: string }>;
  salary: {
    _comment?: string;
    enabled: boolean;
    floorAnnualCad: number;
    hoursPerYear: number;
    defaultCurrency: string;
    ratesToCad: Record<string, number>;
  };
  language: {
    _comment?: string;
    enabled: boolean;
    dropNonEnglishPostings: boolean;
    blockedLanguages: string[];
  };
  description: {
    _comment?: string;
    hardDropPhrases: string[];
    flagPhrases: string[];
  };
  llm: {
    _comment?: string;
    enabled: boolean;
    batchSize: number;
    descriptionChars: number;
    model: string | null;
    targetRoles: string;
    hardPasses: string;
  };
};

export type PrefilterConfigResponse = {
  status: "ok" | "missing" | "invalid" | "off-in-tests";
  path: string | null;
  config: PrefilterConfigDto | null;
  error: string | null;
  defaults: PrefilterConfigDto;
};

export type PrefilterPreview = {
  total: number;
  counts: { drop: number; keep: number; undecided: number };
  items: Array<{
    id: string;
    title: string;
    employer: string;
    location: string | null;
    decision: "drop" | "keep" | "undecided";
    detail: string;
  }>;
};

export async function getFilteredJobs(): Promise<{ jobs: FilteredJob[] }> {
  return fetchApi<{ jobs: FilteredJob[] }>("/prefilter/jobs");
}

export async function restoreFilteredJob(
  id: string,
): Promise<{ id: string; restored: boolean }> {
  return fetchApi<{ id: string; restored: boolean }>(
    `/prefilter/jobs/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export async function getPrefilterConfig(): Promise<PrefilterConfigResponse> {
  return fetchApi<PrefilterConfigResponse>("/prefilter/config");
}

export async function savePrefilterConfig(
  config: PrefilterConfigDto,
): Promise<{ config: PrefilterConfigDto; path: string }> {
  return fetchApi<{ config: PrefilterConfigDto; path: string }>(
    "/prefilter/config",
    {
      method: "PUT",
      body: JSON.stringify({ config }),
    },
  );
}

export async function previewPrefilter(
  config: PrefilterConfigDto,
): Promise<PrefilterPreview> {
  return fetchApi<PrefilterPreview>("/prefilter/preview", {
    method: "POST",
    body: JSON.stringify({ config }),
  });
}

export async function scoreBacklog(): Promise<{ started: boolean }> {
  return fetchApi<{ started: boolean }>("/prefilter/score-backlog", {
    method: "POST",
  });
}

export type RecheckScoredResult = {
  checked: number;
  moved: number;
  drops: PrefilterPreview["items"];
};

/** Rules only (free). apply=false lists what would move; apply=true moves them. */
export async function recheckScoredJobs(
  apply: boolean,
): Promise<RecheckScoredResult> {
  return fetchApi<RecheckScoredResult>("/prefilter/recheck-scored", {
    method: "POST",
    body: JSON.stringify({ apply }),
  });
}

export async function saveSkipReason(
  id: string,
  reason: string | null,
): Promise<{ id: string; skipReason: string | null }> {
  return fetchApi<{ id: string; skipReason: string | null }>(
    `/prefilter/jobs/${encodeURIComponent(id)}/skip-reason`,
    { method: "PUT", body: JSON.stringify({ reason }) },
  );
}

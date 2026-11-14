import type {
  BackfillEstimate,
  BackfillKind,
  BackfillResult,
  OverviewRange,
  OverviewResponse,
} from "@shared/types.js";
import { fetchApi } from "./core";

export async function getOverview(args: {
  range: OverviewRange;
  timeZone: string;
}): Promise<OverviewResponse> {
  const params = new URLSearchParams({
    range: String(args.range),
    tz: args.timeZone,
  });
  return fetchApi<OverviewResponse>(`/overview?${params.toString()}`);
}

export async function getBackfillEstimate(
  kind: BackfillKind,
): Promise<BackfillEstimate> {
  return fetchApi<BackfillEstimate>(
    `/overview/backfill?kind=${encodeURIComponent(kind)}`,
  );
}

export async function runBackfill(kind: BackfillKind): Promise<BackfillResult> {
  return fetchApi<BackfillResult>("/overview/backfill", {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

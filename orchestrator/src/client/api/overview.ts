import type { OverviewRange, OverviewResponse } from "@shared/types.js";
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

import type {
  SpendModelPrice,
  SpendPricing,
  SpendReport,
} from "@shared/types.js";
import { fetchApi } from "./core";

export async function getSpendReport(args: {
  from?: string | null;
  to?: string | null;
  timeZone: string;
}): Promise<SpendReport> {
  const params = new URLSearchParams({ tz: args.timeZone });
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  return fetchApi<SpendReport>(`/spend?${params.toString()}`);
}

export async function getRunCosts(
  runIds: string[],
): Promise<{ costs: Record<string, number> }> {
  if (runIds.length === 0) return { costs: {} };
  const params = new URLSearchParams({ ids: runIds.join(",") });
  return fetchApi<{ costs: Record<string, number> }>(
    `/spend/runs?${params.toString()}`,
  );
}

export async function getSpendPricing(): Promise<SpendPricing> {
  return fetchApi<SpendPricing>("/spend/pricing");
}

export async function saveSpendPricing(
  models: Record<string, SpendModelPrice>,
): Promise<SpendPricing> {
  return fetchApi<SpendPricing>("/spend/pricing", {
    method: "PUT",
    body: JSON.stringify({ models }),
  });
}

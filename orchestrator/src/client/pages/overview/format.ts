import { OVERVIEW_MIN_ROW_SAMPLE } from "@shared/types.js";

export const percent = (n: number, d: number) =>
  d === 0 ? 0 : Math.round((n / d) * 100);

/** "7 of 18 · 39%", or "7 of 18" when the sample is too small to read. */
export function rateLabel(replied: number, applied: number): string {
  const base = `${replied} of ${applied}`;
  return applied >= OVERVIEW_MIN_ROW_SAMPLE
    ? `${base} · ${percent(replied, applied)}%`
    : base;
}

export const canShowRate = (applied: number) =>
  applied >= OVERVIEW_MIN_ROW_SAMPLE;

export const formatDays = (days: number | null) =>
  days === null ? "—" : `${days} ${days === 1 ? "day" : "days"}`;

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Day-of-week presets for the scheduled search (0 = Sunday … 6 = Saturday). */

export type ScheduleFrequency =
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "custom";

export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: "Every day",
  weekdays: "Weekdays (Mon–Fri)",
  weekends: "Weekends",
  weekly: "Once a week",
  custom: "Custom days",
};

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalize(days: number[]): number[] {
  return [...new Set(days)]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

export function frequencyFromDays(days: number[]): ScheduleFrequency {
  const key = normalize(days).join(",");
  if (key === "0,1,2,3,4,5,6") return "daily";
  if (key === "1,2,3,4,5") return "weekdays";
  if (key === "0,6") return "weekends";
  if (normalize(days).length === 1) return "weekly";
  return "custom";
}

/**
 * Days for a newly picked frequency. "Once a week" keeps the first currently
 * picked day (Monday if none); "custom" keeps the current days.
 */
export function daysForFrequency(
  frequency: ScheduleFrequency,
  current: number[],
): number[] {
  switch (frequency) {
    case "daily":
      return [0, 1, 2, 3, 4, 5, 6];
    case "weekdays":
      return [1, 2, 3, 4, 5];
    case "weekends":
      return [0, 6];
    case "weekly": {
      const firstWeekday = normalize(current).find((d) => d >= 1 && d <= 5);
      return [firstWeekday ?? normalize(current)[0] ?? 1];
    }
    case "custom":
      return normalize(current).length > 0 ? normalize(current) : [1];
  }
}

/** Short label, e.g. "Daily", "Weekdays", "Mondays", "Mon, Wed, Fri". */
export function describeDays(days: number[]): string {
  const sorted = normalize(days);
  switch (frequencyFromDays(sorted)) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "weekly":
      return `${DAY_LONG[sorted[0]]}s`;
    case "custom":
      return sorted.map((d) => DAY_SHORT[d]).join(", ");
  }
}

/** Toggle one day for the custom picker, never leaving zero days. */
export function toggleDay(days: number[], day: number): number[] {
  const set = new Set(normalize(days));
  if (set.has(day)) {
    if (set.size === 1) return normalize(days);
    set.delete(day);
  } else {
    set.add(day);
  }
  return normalize([...set]);
}

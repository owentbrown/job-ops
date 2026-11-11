import { describe, expect, it } from "vitest";
import {
  daysForFrequency,
  describeDays,
  frequencyFromDays,
  toggleDay,
} from "./scheduleDays";

describe("schedule days", () => {
  it("recognises presets", () => {
    expect(frequencyFromDays([0, 1, 2, 3, 4, 5, 6])).toBe("daily");
    expect(frequencyFromDays([5, 4, 3, 2, 1])).toBe("weekdays");
    expect(frequencyFromDays([6, 0])).toBe("weekends");
    expect(frequencyFromDays([3])).toBe("weekly");
    expect(frequencyFromDays([1, 3, 5])).toBe("custom");
  });

  it("describes days for the button label", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Daily");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeDays([1])).toBe("Mondays");
    expect(describeDays([5, 1, 3])).toBe("Mon, Wed, Fri");
  });

  it("picks sensible days when the frequency changes", () => {
    expect(daysForFrequency("weekdays", [])).toEqual([1, 2, 3, 4, 5]);
    expect(daysForFrequency("weekly", [0, 1, 2, 3, 4, 5, 6])).toEqual([1]);
    expect(daysForFrequency("weekly", [0, 6])).toEqual([0]);
    expect(daysForFrequency("custom", [2, 4])).toEqual([2, 4]);
  });

  it("never toggles the last day off", () => {
    expect(toggleDay([1, 3], 3)).toEqual([1]);
    expect(toggleDay([1], 1)).toEqual([1]);
    expect(toggleDay([1], 5)).toEqual([1, 5]);
  });
});

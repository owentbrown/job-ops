import { describe, expect, it } from "vitest";
import { sentLetterDate } from "./cover-letter";

describe("sentLetterDate", () => {
  it("dates a sent application's letter on the day it was applied", () => {
    expect(
      sentLetterDate({
        status: "in_progress",
        appliedAt: "2026-11-10T15:00:00Z",
      }),
    ).toEqual(new Date("2026-11-10T15:00:00Z"));
  });

  it("uses today for letters not sent yet", () => {
    expect(
      sentLetterDate({ status: "ready", appliedAt: null }),
    ).toBeUndefined();
  });
});

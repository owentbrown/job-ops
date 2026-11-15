import { describe, expect, it } from "vitest";
import {
  comparePeriodsNewestFirst,
  formatPeriod,
  isPeriodReversed,
  isSortedByPeriod,
  parsePeriod,
  placeItemByPeriod,
  placeSavedItem,
  sortItemsByPeriod,
} from "./period";

describe("parsePeriod", () => {
  it.each([
    [
      "Aug 2026 – Present",
      { start: { year: 2026, month: 8 }, end: "present" as const },
    ],
    [
      "Aug 2026 to Present",
      { start: { year: 2026, month: 8 }, end: "present" as const },
    ],
    [
      "August 2022 - August 2026",
      { start: { year: 2022, month: 8 }, end: { year: 2026, month: 8 } },
    ],
    [
      "May 2019–Aug 2020",
      { start: { year: 2019, month: 5 }, end: { year: 2020, month: 8 } },
    ],
    [
      "08/2026 - Current",
      { start: { year: 2026, month: 8 }, end: "present" as const },
    ],
    [
      "2026-08 – now",
      { start: { year: 2026, month: 8 }, end: "present" as const },
    ],
    [
      "2020 – 2021",
      { start: { year: 2020, month: null }, end: { year: 2021, month: null } },
    ],
    [
      "2020-2021",
      { start: { year: 2020, month: null }, end: { year: 2021, month: null } },
    ],
    [
      "Sept. 2018",
      { start: { year: 2018, month: 9 }, end: { year: 2018, month: 9 } },
    ],
  ])("reads %j", (text, expected) => {
    expect(parsePeriod(text)).toEqual(expected);
  });

  it.each([
    "",
    "   ",
    "Summer 2019",
    "Present",
    "Aug 26 – Present",
    "Foo 2020",
  ])("returns null for %j", (text) => {
    expect(parsePeriod(text)).toBeNull();
  });
});

describe("formatPeriod", () => {
  it("formats current, closed and single-date periods", () => {
    expect(
      formatPeriod({ start: { year: 2026, month: 8 }, end: "present" }),
    ).toBe("Aug 2026 – Present");
    expect(
      formatPeriod({
        start: { year: 2019, month: 5 },
        end: { year: 2020, month: 8 },
      }),
    ).toBe("May 2019 – Aug 2020");
    expect(
      formatPeriod({
        start: { year: 2018, month: null },
        end: { year: 2018, month: null },
      }),
    ).toBe("2018");
  });

  it("round-trips the text it produces", () => {
    for (const text of [
      "Aug 2026 – Present",
      "Aug 2022 – Aug 2026",
      "2020 – 2021",
      "Jan 2018",
    ]) {
      const parsed = parsePeriod(text);
      expect(parsed).not.toBeNull();
      if (parsed) expect(formatPeriod(parsed)).toBe(text);
    }
  });
});

describe("comparePeriodsNewestFirst", () => {
  const read = (text: string) => {
    const parsed = parsePeriod(text);
    if (!parsed) throw new Error(`unparseable: ${text}`);
    return parsed;
  };

  it("puts current entries first, then later end dates, then later starts", () => {
    expect(
      comparePeriodsNewestFirst(
        read("Aug 2026 – Present"),
        read("Aug 2022 – Aug 2026"),
      ),
    ).toBeLessThan(0);
    expect(
      comparePeriodsNewestFirst(
        read("Jul 2021 – Aug 2022"),
        read("Aug 2022 – Aug 2026"),
      ),
    ).toBeGreaterThan(0);
    expect(
      comparePeriodsNewestFirst(
        read("Jan 2020 – Present"),
        read("Jan 2015 – Present"),
      ),
    ).toBeLessThan(0);
  });

  it("flags end dates before start dates", () => {
    expect(isPeriodReversed(read("Aug 2026 – Jan 2020"))).toBe(true);
    expect(isPeriodReversed(read("Aug 2020 – Present"))).toBe(false);
  });
});

const roles: Array<Record<string, unknown> & { id: string; period: string }> = [
  { id: "senior", period: "Aug 2022 – Aug 2026" },
  { id: "manager", period: "Jul 2021 – Aug 2022" },
  { id: "bosch", period: "Jan 2018 – Apr 2018" },
];

describe("placeSavedItem", () => {
  it("puts a newly added current role at the top", () => {
    const next = placeSavedItem(
      roles,
      { id: "dpm", period: "Aug 2026 to Present" },
      null,
      "period",
    );
    expect(next.map((item) => item.id)).toEqual([
      "dpm",
      "senior",
      "manager",
      "bosch",
    ]);
  });

  it("slots a new older role between the right neighbours", () => {
    const next = placeSavedItem(
      roles,
      { id: "change", period: "Apr 2018 – May 2019" },
      null,
      "period",
    );
    expect(next.map((item) => item.id)).toEqual([
      "senior",
      "manager",
      "change",
      "bosch",
    ]);
  });

  it("keeps an edited item in place when its period is unchanged", () => {
    const manual = [roles[2], roles[0], roles[1]] as typeof roles;
    const next = placeSavedItem(
      manual,
      { id: "bosch", period: "Jan 2018 – Apr 2018", description: "new" },
      0,
      "period",
    );
    expect(next.map((item) => item.id)).toEqual(["bosch", "senior", "manager"]);
    expect(next[0]).toMatchObject({ description: "new" });
  });

  it("moves an edited item when its period changes", () => {
    const next = placeSavedItem(
      roles,
      { id: "bosch", period: "Sep 2026 – Present" },
      2,
      "period",
    );
    expect(next.map((item) => item.id)).toEqual(["bosch", "senior", "manager"]);
  });

  it("appends without sorting when the section has no period field", () => {
    const next = placeSavedItem(
      roles,
      { id: "dpm", period: "Aug 2026 – Present" },
      null,
      null,
    );
    expect(next.at(-1)?.id).toBe("dpm");
  });

  it("leaves a new item with unreadable dates at the end", () => {
    const next = placeSavedItem(
      roles,
      { id: "odd", period: "Summer 2019" },
      null,
      "period",
    );
    expect(next.at(-1)?.id).toBe("odd");
  });
});

describe("placeItemByPeriod", () => {
  it("keeps undated entries in their place when slotting an older role", () => {
    const items = [
      { id: "senior", period: "Aug 2022 – Aug 2026" },
      { id: "undated", period: "" },
      { id: "new", period: "Jan 2015 – Dec 2016" },
    ];
    expect(placeItemByPeriod(items, 2).map((item) => item.id)).toEqual([
      "senior",
      "new",
      "undated",
    ]);
  });
});

describe("sortItemsByPeriod", () => {
  it("sorts newest first and moves undated entries to the end", () => {
    const items = [
      { id: "bosch", period: "Jan 2018 – Apr 2018" },
      { id: "custom", period: "Summer 2019" },
      { id: "dpm", period: "Aug 2026 – Present" },
      { id: "senior", period: "Aug 2022 – Aug 2026" },
    ];
    const sorted = sortItemsByPeriod(items);
    expect(sorted.map((item) => item.id)).toEqual([
      "dpm",
      "senior",
      "bosch",
      "custom",
    ]);
    expect(isSortedByPeriod(items)).toBe(false);
    expect(isSortedByPeriod(sorted)).toBe(true);
  });
});

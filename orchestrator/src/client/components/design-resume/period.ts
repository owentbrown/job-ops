/**
 * Helpers for resume "period" strings (e.g. "Aug 2026 – Present").
 *
 * Reactive Resume stores a period as free text, and the PDF renderers,
 * tailoring and import/export all read that text as-is. Resume Studio keeps
 * the text as the stored value and layers structured start/end inputs and
 * date ordering on top of it, so nothing downstream has to change.
 */

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const PRESENT_WORDS = new Set([
  "present",
  "current",
  "now",
  "today",
  "ongoing",
]);

export const MIN_PERIOD_YEAR = 1900;
export const MAX_PERIOD_YEAR = 2100;

export type PeriodDate = { year: number; month: number | null };

export type ParsedPeriod = {
  start: PeriodDate;
  end: PeriodDate | "present";
};

function isValidYear(year: number): boolean {
  return (
    Number.isInteger(year) && year >= MIN_PERIOD_YEAR && year <= MAX_PERIOD_YEAR
  );
}

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function parseDatePart(raw: string): PeriodDate | null {
  const text = raw.trim().replace(/\.$/, "").toLowerCase();
  if (!text) return null;

  // "2026"
  let match = /^(\d{4})$/.exec(text);
  if (match) {
    const year = Number(match[1]);
    return isValidYear(year) ? { year, month: null } : null;
  }

  // "Aug 2026", "August 2026", "Aug. 2026", "Aug, 2026"
  match = /^([a-z]+)\.?,?\s+(\d{4})$/.exec(text);
  if (match) {
    const month = MONTH_LOOKUP[match[1] ?? ""];
    const year = Number(match[2]);
    return month && isValidYear(year) ? { year, month } : null;
  }

  // "08/2026", "8/2026"
  match = /^(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    return isValidMonth(month) && isValidYear(year) ? { year, month } : null;
  }

  // "2026-08", "2026/08"
  match = /^(\d{4})[-/](\d{1,2})$/.exec(text);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    return isValidMonth(month) && isValidYear(year) ? { year, month } : null;
  }

  return null;
}

function splitPeriod(text: string): string[] {
  // Prefer an explicit range separator surrounded by spaces, so "2026-08"
  // style dates keep their hyphen.
  const spaced = text.split(/\s+(?:–|—|-|to|until)\s+/i);
  if (spaced.length === 2) return spaced;
  const tight = text.split(/\s*[–—]\s*/);
  if (tight.length === 2) return tight;
  // "2020-2021" (year-only range without spaces)
  const yearRange = /^(\d{4})-(\d{4})$/.exec(text);
  if (yearRange) return [yearRange[1] ?? "", yearRange[2] ?? ""];
  return [text];
}

/** Parse a period string. Returns null when it can't be read as dates. */
export function parsePeriod(value: string): ParsedPeriod | null {
  const text = value.trim();
  if (!text) return null;

  const parts = splitPeriod(text);
  if (parts.length === 1) {
    const single = parseDatePart(parts[0] ?? "");
    return single ? { start: single, end: single } : null;
  }

  const start = parseDatePart(parts[0] ?? "");
  if (!start) return null;
  const endText = (parts[1] ?? "").trim().toLowerCase();
  if (PRESENT_WORDS.has(endText)) return { start, end: "present" };
  const end = parseDatePart(endText);
  return end ? { start, end } : null;
}

export function formatPeriodDate(date: PeriodDate): string {
  return date.month
    ? `${MONTH_LABELS[date.month - 1]} ${date.year}`
    : `${date.year}`;
}

function sameDate(a: PeriodDate, b: PeriodDate): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Format a parsed period, e.g. "Aug 2026 – Present" or "May 2019 – Aug 2020". */
export function formatPeriod(period: ParsedPeriod): string {
  const start = formatPeriodDate(period.start);
  if (period.end === "present") return `${start} – Present`;
  if (sameDate(period.start, period.end)) return start;
  return `${start} – ${formatPeriodDate(period.end)}`;
}

function dateValue(date: PeriodDate, fallbackMonth: number): number {
  return date.year * 12 + (date.month ?? fallbackMonth);
}

/**
 * Compare two periods for newest-first ordering: current entries first, then
 * by end date, then by start date. Negative when `a` should come before `b`.
 */
export function comparePeriodsNewestFirst(
  a: ParsedPeriod,
  b: ParsedPeriod,
): number {
  const endA =
    a.end === "present" ? Number.POSITIVE_INFINITY : dateValue(a.end, 12);
  const endB =
    b.end === "present" ? Number.POSITIVE_INFINITY : dateValue(b.end, 12);
  if (endA !== endB) return endB > endA ? 1 : -1;
  const startA = dateValue(a.start, 1);
  const startB = dateValue(b.start, 1);
  if (startA !== startB) return startB > startA ? 1 : -1;
  return 0;
}

/** True when the end date is earlier than the start date. */
export function isPeriodReversed(period: ParsedPeriod): boolean {
  if (period.end === "present") return false;
  return dateValue(period.end, 12) < dateValue(period.start, 1);
}

function readPeriod(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value : "";
}

/**
 * Move the item at `index` to its date position: just before the first item
 * (top to bottom) whose period is older. Items whose period can't be parsed
 * are skipped, so manual placements around them are kept. When the item's
 * own period can't be parsed, the list is returned unchanged.
 */
export function placeItemByPeriod<T extends Record<string, unknown>>(
  items: T[],
  index: number,
  key = "period",
): T[] {
  const target = items[index];
  if (!target) return items;
  const targetPeriod = parsePeriod(readPeriod(target, key));
  if (!targetPeriod) return items;

  const rest = items.filter((_, i) => i !== index);
  let insertAt = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const other = rest[i];
    if (!other) continue;
    const otherPeriod = parsePeriod(readPeriod(other, key));
    if (!otherPeriod) continue;
    if (comparePeriodsNewestFirst(targetPeriod, otherPeriod) < 0) {
      insertAt = i;
      break;
    }
  }

  // If no older item exists, keep the item after the last item it is not
  // newer than, rather than jumping past unparseable entries at the end.
  if (insertAt === rest.length) {
    let lastDatedIndex = -1;
    for (let i = 0; i < rest.length; i++) {
      const other = rest[i];
      if (other && parsePeriod(readPeriod(other, key))) lastDatedIndex = i;
    }
    insertAt =
      lastDatedIndex === -1 ? Math.min(index, rest.length) : lastDatedIndex + 1;
  }

  const next = [...rest];
  next.splice(insertAt, 0, target);
  return next;
}

/**
 * Sort a whole list newest-first. Items without a readable period keep their
 * relative order and go to the end.
 */
export function sortItemsByPeriod<T extends Record<string, unknown>>(
  items: T[],
  key = "period",
): T[] {
  const dated: Array<{ item: T; period: ParsedPeriod; order: number }> = [];
  const undated: T[] = [];
  items.forEach((item, order) => {
    const period = parsePeriod(readPeriod(item, key));
    if (period) dated.push({ item, period, order });
    else undated.push(item);
  });
  dated.sort(
    (a, b) =>
      comparePeriodsNewestFirst(a.period, b.period) || a.order - b.order,
  );
  return [...dated.map((entry) => entry.item), ...undated];
}

/** True when the list is already in newest-first order (ignoring undated items). */
export function isSortedByPeriod(
  items: Record<string, unknown>[],
  key = "period",
): boolean {
  const sorted = sortItemsByPeriod(items, key);
  return sorted.every((item, index) => item === items[index]);
}

/**
 * Apply a saved dialog item to its section list. A new item, or an edit that
 * changes the period, is moved to its date position. Other edits keep the
 * item where it is, so manual ordering survives description changes.
 */
export function placeSavedItem<T extends Record<string, unknown>>(
  items: T[],
  item: T,
  editIndex: number | null,
  periodKey: string | null,
): T[] {
  const isNew = editIndex == null || editIndex < 0 || editIndex >= items.length;
  const next = isNew
    ? [...items, item]
    : items.map((entry, index) => (index === editIndex ? item : entry));
  if (!periodKey) return next;

  const targetIndex = isNew ? next.length - 1 : editIndex;
  const periodChanged =
    isNew ||
    readPeriod(items[editIndex] ?? {}, periodKey) !==
      readPeriod(item, periodKey);
  return periodChanged ? placeItemByPeriod(next, targetIndex, periodKey) : next;
}

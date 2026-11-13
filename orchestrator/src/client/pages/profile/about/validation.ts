import type { z } from "zod";

/** Field path ("items.2.label") to a friendly message. First issue wins. */
export type FieldErrors = Record<string, string>;

function friendly(issue: z.ZodIssue): string {
  if (issue.code === "too_big" && issue.type === "string") {
    return `Keep this under ${Number(issue.maximum)} characters.`;
  }
  if (issue.code === "too_big" && issue.type === "array") {
    return `Up to ${Number(issue.maximum)} allowed.`;
  }
  if (issue.code === "too_small" && issue.type === "string") {
    return "This can't be empty.";
  }
  return issue.message;
}

/** Validate with a shared Zod schema and return data or inline errors. */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!(key in errors)) errors[key] = friendly(issue);
  }
  return { ok: false, errors };
}

/** Trimmed, de-duplicated (case-insensitive), non-empty list. */
export function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const wordCount = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

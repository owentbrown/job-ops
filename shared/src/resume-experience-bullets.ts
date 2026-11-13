/**
 * Per-job experience bullet selection.
 *
 * The base ("master") resume keeps every bullet for every role so scoring,
 * fit assessment and Ghostwriter see the full history. For a tailored PDF a
 * job can store which bullets to keep per experience item:
 *
 *   { "<experience item id>": [0, 2, 3] }
 *
 * Indices are 0-based positions in the bullet list the renderers extract from
 * the item's `description` HTML (see `extractResumeHtmlBullets`). Items that
 * are not in the map keep all of their bullets, and a missing/empty selection
 * leaves the resume exactly as it is.
 */

import { stripHtmlTags } from "./utils/string";

export type ExperienceBulletSelection = Record<string, number[]>;

export interface ExperienceBulletCatalogItem {
  id: string;
  company: string;
  position: string;
  period: string;
  /** Plain-text bullets, in the same order the renderers use. */
  bullets: string[];
}

type RecordLike = Record<string, unknown>;

const LIST_ITEM_PATTERN = /<li[^>]*>([\s\S]*?)<\/li>/gi;
const INLINE_TAG_PATTERN = /(<\/?(?:strong|b|em|i)>)/gi;

function asRecord(value: unknown): RecordLike | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Strips HTML down to text with line breaks, keeping inline emphasis tags
 * (strong/b/em/i) for renderers that support them.
 */
export function stripResumeHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
      .replace(/<\/li>\s*<li[^>]*>/gi, "\n")
      .replace(
        /<(?!strong\b|b\b|em\b|i\b|\/strong\b|\/b\b|\/em\b|\/i\b)\/?[a-zA-Z0-9]+(?:\s+[^>]*)?>/gi,
        " ",
      ),
  )
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * The bullets of a resume rich-text field: its `<li>` items when it has any,
 * otherwise its non-empty lines/paragraphs. Inline emphasis tags are kept.
 */
export function extractResumeHtmlBullets(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];

  const listItems = [...value.matchAll(LIST_ITEM_PATTERN)]
    .map((match) => stripResumeHtml(match[1] ?? ""))
    .filter(Boolean);
  if (listItems.length > 0) return listItems;

  const cleaned = stripResumeHtml(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Escapes text for HTML while keeping inline emphasis tags. */
function encodeBulletHtml(text: string): string {
  return text
    .split(INLINE_TAG_PATTERN)
    .map((part, index) =>
      index % 2 === 1
        ? part.toLowerCase()
        : part
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
    )
    .join("");
}

/**
 * Keeps only the bullets at `keepIndices` in a rich-text field, preserving
 * their original order and markup. Returns "" when nothing is kept.
 */
export function applyBulletSelectionToHtml(
  html: string,
  keepIndices: Iterable<number>,
): string {
  const keep = new Set(keepIndices);
  const bullets = extractResumeHtmlBullets(html);
  if (bullets.length === 0) return html;
  if (!bullets.some((_, index) => keep.has(index))) return "";
  if (bullets.every((_, index) => keep.has(index))) return html;

  const matches = [...html.matchAll(LIST_ITEM_PATTERN)];
  const hasListBullets = matches.some((match) =>
    Boolean(stripResumeHtml(match[1] ?? "")),
  );

  if (hasListBullets) {
    let output = "";
    let cursor = 0;
    let bulletIndex = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      const isBullet = Boolean(stripResumeHtml(match[1] ?? ""));
      const keepItem = !isBullet || keep.has(bulletIndex);
      if (isBullet) bulletIndex += 1;
      output += html.slice(cursor, start);
      if (keepItem) output += match[0];
      cursor = start + match[0].length;
    }
    output += html.slice(cursor);
    return output.replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, "").trim();
  }

  const kept = bullets.filter((_, index) => keep.has(index));
  return `<ul>${kept
    .map((bullet) => `<li><p>${encodeBulletHtml(bullet)}</p></li>`)
    .join("")}</ul>`;
}

function normalizeIndices(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const indices = value.filter(
    (index): index is number => Number.isInteger(index) && index >= 0,
  );
  return [...new Set(indices)].sort((a, b) => a - b);
}

/**
 * Parses a stored selection (JSON string or object). Returns null when there
 * is no usable selection, which means "keep every bullet".
 */
export function parseExperienceBulletSelection(
  raw: unknown,
): ExperienceBulletSelection | null {
  let value = raw;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  const record = asRecord(value);
  if (!record) return null;

  const selection: ExperienceBulletSelection = {};
  for (const [id, indices] of Object.entries(record)) {
    const trimmedId = id.trim();
    const normalized = normalizeIndices(indices);
    if (!trimmedId || !normalized) continue;
    selection[trimmedId] = normalized;
  }
  return Object.keys(selection).length > 0 ? selection : null;
}

/** Stable JSON (sorted ids and indices); "" for no selection. */
export function serializeExperienceBulletSelection(
  selection: ExperienceBulletSelection | null | undefined,
): string {
  const parsed = parseExperienceBulletSelection(selection ?? null);
  if (!parsed) return "";
  const sorted: ExperienceBulletSelection = {};
  for (const id of Object.keys(parsed).sort()) sorted[id] = parsed[id];
  return JSON.stringify(sorted);
}

/** Visible experience items of a resume (v5 data) with their bullets. */
export function extractExperienceBulletCatalog(
  resumeData: unknown,
): ExperienceBulletCatalogItem[] {
  const sections = asRecord(asRecord(resumeData)?.sections);
  const experience = asRecord(sections?.experience);
  if (!experience || experience.hidden === true) return [];
  const items = Array.isArray(experience.items) ? experience.items : [];

  const catalog: ExperienceBulletCatalogItem[] = [];
  for (const raw of items) {
    const item = asRecord(raw);
    if (!item || item.hidden === true || item.visible === false) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    catalog.push({
      id,
      company: typeof item.company === "string" ? item.company : "",
      position: typeof item.position === "string" ? item.position : "",
      period:
        typeof item.period === "string"
          ? item.period
          : typeof item.date === "string"
            ? item.date
            : "",
      bullets: extractResumeHtmlBullets(item.description)
        .map((bullet) => stripHtmlTags(bullet))
        .filter(Boolean),
    });
  }
  return catalog;
}

/**
 * Drops ids that are not in the catalog and indices past each item's last
 * bullet. Returns null when nothing usable remains.
 */
export function constrainExperienceBulletSelection(
  selection: ExperienceBulletSelection | null | undefined,
  catalog: readonly ExperienceBulletCatalogItem[],
): ExperienceBulletSelection | null {
  if (!selection) return null;
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const constrained: ExperienceBulletSelection = {};
  for (const [id, indices] of Object.entries(selection)) {
    const item = byId.get(id);
    if (!item || item.bullets.length === 0) continue;
    constrained[id] = [...new Set(indices)]
      .filter((index) => index >= 0 && index < item.bullets.length)
      .sort((a, b) => a - b);
  }
  return Object.keys(constrained).length > 0 ? constrained : null;
}

/** Indices kept for an item: its stored selection, or every bullet. */
export function getKeptBulletIndices(
  selection: ExperienceBulletSelection | null | undefined,
  item: ExperienceBulletCatalogItem,
): number[] {
  const stored = selection?.[item.id];
  if (!stored) return item.bullets.map((_, index) => index);
  return stored.filter((index) => index < item.bullets.length);
}

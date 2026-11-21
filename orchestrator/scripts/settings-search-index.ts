/**
 * Builds the full-text index behind the Settings search box.
 *
 * At build time this reads SettingsPage.tsx, finds which component each
 * settings section renders, follows that component's own .tsx imports a few
 * levels down, and collects the words a person can see on screen (JSX text and
 * label-like strings). The client imports the result as
 * `virtual:settings-search-index`: `{ [sectionId]: "lowercase text ..." }`.
 *
 * It runs again on every build, so new settings are searchable without anyone
 * maintaining keyword lists.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:settings-search-index";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const MAX_IMPORT_DEPTH = 3;
/** Wrappers whose own text isn't part of any one section. */
const SKIPPED_COMPONENTS = new Set(["EmbeddedPage", "SettingsSectionFrame"]);

type Aliases = Record<string, string>;

function resolveImport(
  specifier: string,
  fromFile: string,
  aliases: Aliases,
): string | null {
  let base: string | null = null;
  if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    for (const [alias, target] of Object.entries(aliases)) {
      if (specifier === alias || specifier.startsWith(`${alias}/`)) {
        base = path.join(target, specifier.slice(alias.length));
        break;
      }
    }
  }
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (candidate.endsWith(".tsx") && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Maps each imported name in a file to its specifier. */
function readImports(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  const pattern = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const [, clause, specifier] = match;
    for (const name of clause.replace(/[{}]/g, " ").split(/[\s,]+/)) {
      const cleaned = name.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(cleaned) && cleaned !== "as") {
        imports.set(cleaned, specifier);
      }
    }
  }
  return imports;
}

function looksLikeClassList(value: string): boolean {
  const tokens = value.trim().split(/\s+/);
  return tokens.every((token) => /^[a-z0-9:/[\]\-.%!#()_=>&*]+$/.test(token))
    ? tokens.some((token) => /[-:[]/.test(token))
    : false;
}

/** Drops code-ish tokens such as `dark:bg-muted`, `w-[3rem]` or `a/b`. */
function cleanWords(text: string): string {
  return text
    .split(/\s+/)
    .filter((token) => !/[[\]/=]|:\S/.test(token))
    .join(" ")
    .trim();
}

/** Text a person can read: JSX text and label-like string literals. */
export function extractVisibleText(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*</g)) {
    const text = match[1].replace(/\s+/g, " ").trim();
    if (!text || /[=;]|=>|&&|\|\||\?\s*\(|\)\s*$|^\)/.test(text)) continue;
    found.push(cleanWords(text));
  }
  for (const match of source.matchAll(/(["'`])((?:(?!\1)[^\\\n]){2,})\1/g)) {
    const text = match[2].replace(/\$\{[^}]*\}/g, " ").trim();
    if (!/[A-Za-z]/.test(text)) continue;
    if (/^[@./]|^[a-z]+:\/\//.test(text)) continue; // imports, paths, URLs
    if (looksLikeClassList(text)) continue;
    const isSentence = /\s/.test(text);
    const isLabelWord = /^[A-Z][A-Za-z]+$/.test(text);
    if (isSentence || isLabelWord) found.push(cleanWords(text));
  }
  return found;
}

/** Every .tsx file a section's component pulls in, entry file first. */
function collectSectionFiles(entryFile: string, aliases: Aliases): string[] {
  const seen = new Set<string>();
  const visit = (file: string, depth: number) => {
    if (seen.has(file) || depth > MAX_IMPORT_DEPTH) return;
    if (file.includes(`${path.sep}components${path.sep}ui${path.sep}`)) return;
    if (/\.(test|stories)\.tsx$/.test(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const specifier of new Set(readImports(source).values())) {
      const next = resolveImport(specifier, file, aliases);
      if (next) visit(next, depth + 1);
    }
  };
  visit(entryFile, 0);
  return [...seen];
}

/** `{ sectionId: [ComponentName, ...] }` from the activeSectionContent switch. */
export function readSectionComponents(
  settingsSource: string,
): Map<string, string[]> {
  const start = settingsSource.indexOf("let activeSectionContent");
  if (start < 0) return new Map();
  const region = settingsSource.slice(start);
  const end = region.search(/\n {2}}\n/);
  const body = end > 0 ? region.slice(0, end) : region;
  const sections = new Map<string, string[]>();
  const chunks = body.split(/\n\s*case "/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const names = [...chunk.matchAll(/<([A-Z][A-Za-z0-9]*)/g)]
      .map((match) => match[1])
      .filter((name) => !SKIPPED_COMPONENTS.has(name));
    sections.set(id, [...new Set(names)]);
  }
  return sections;
}

/**
 * A file pulled in by this many sections is shared page chrome (headers,
 * theme toggles), not content of any one section, so it is left out.
 */
const SHARED_FILE_SECTION_COUNT = 3;

export function buildSettingsSearchIndex(
  settingsPageFile: string,
  aliases: Aliases,
  watch: (file: string) => void = () => undefined,
): Record<string, string> {
  const source = readFileSync(settingsPageFile, "utf8");
  watch(settingsPageFile);
  const imports = readImports(source);

  const sectionFiles = new Map<string, { entries: string[]; all: string[] }>();
  const usage = new Map<string, number>();
  for (const [sectionId, components] of readSectionComponents(source)) {
    const entries: string[] = [];
    const all = new Set<string>();
    for (const component of components) {
      const specifier = imports.get(component);
      const file = specifier
        ? resolveImport(specifier, settingsPageFile, aliases)
        : null;
      if (!file) continue;
      entries.push(file);
      for (const found of collectSectionFiles(file, aliases)) all.add(found);
    }
    for (const file of all) usage.set(file, (usage.get(file) ?? 0) + 1);
    sectionFiles.set(sectionId, { entries, all: [...all] });
  }

  const textCache = new Map<string, string>();
  const textOf = (file: string) => {
    let text = textCache.get(file);
    if (text === undefined) {
      watch(file);
      text = extractVisibleText(readFileSync(file, "utf8")).join(" ");
      textCache.set(file, text);
    }
    return text;
  };

  const index: Record<string, string> = {};
  for (const [sectionId, { entries, all }] of sectionFiles) {
    index[sectionId] = all
      .filter(
        (file) =>
          entries.includes(file) ||
          (usage.get(file) ?? 0) < SHARED_FILE_SECTION_COUNT,
      )
      .map(textOf)
      .join(" ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }
  return index;
}

export function settingsSearchIndexPlugin(options: {
  settingsPageFile: string;
  aliases: Aliases;
}): Plugin {
  return {
    name: "jobops-settings-search-index",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const index = buildSettingsSearchIndex(
        options.settingsPageFile,
        options.aliases,
        (file) => this.addWatchFile(file),
      );
      return `export default ${JSON.stringify(index)};`;
    },
  };
}

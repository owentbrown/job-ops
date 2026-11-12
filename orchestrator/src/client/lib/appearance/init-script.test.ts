/**
 * Drift guard: the inline no-flash script in orchestrator/index.html can't
 * import types.ts, so it repeats the storage key, the id lists and the
 * defaults. This test fails if the two copies disagree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  COLOUR_IDS,
  DEFAULT_APPEARANCE,
  MODES,
  THEME_IDS,
} from "./types";

const INDEX_HTML = join(__dirname, "..", "..", "..", "..", "index.html");

function initScript(): string {
  const html = readFileSync(INDEX_HTML, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  const script = scripts.find((s) => s.includes("data-theme"));
  if (!script) throw new Error("Appearance init script not found");
  return script;
}

/** The array literal passed as `pick(s.<field>, [...])`, in order. */
function pickList(script: string, field: string): string[] {
  const match = script.match(
    new RegExp(`pick\\(\\s*s\\.${field}\\s*,\\s*\\[([^\\]]*)\\]`),
  );
  if (!match) throw new Error(`pick(s.${field}, [...]) not found`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("index.html appearance init script", () => {
  const script = initScript();

  it("reads the same storage key", () => {
    expect(script).toContain(
      `localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)})`,
    );
  });

  it.each([
    ["mode", MODES, DEFAULT_APPEARANCE.mode],
    ["theme", THEME_IDS, DEFAULT_APPEARANCE.theme],
    ["colours", COLOUR_IDS, DEFAULT_APPEARANCE.colours],
  ] as const)("%s: same ids, default first", (field, ids: readonly string[], fallback) => {
    const list = pickList(script, field);
    // pick() falls back to the first entry, so it must be the default.
    expect(list[0]).toBe(fallback);
    expect([...list].sort()).toEqual([...ids].sort());
  });

  it("sets the attributes, .dark and color-scheme", () => {
    for (const snippet of [
      'setAttribute("data-mode"',
      'setAttribute("data-theme"',
      'setAttribute("data-colours"',
      'classList.toggle("dark"',
      "style.colorScheme",
    ]) {
      expect(script).toContain(snippet);
    }
  });
});

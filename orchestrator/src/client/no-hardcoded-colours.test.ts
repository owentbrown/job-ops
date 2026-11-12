/**
 * Guard: client code takes colours from CSS variables / Tailwind tokens so the
 * appearance system (src/client/lib/appearance) can restyle everything.
 * Fails on hex literals (#rgb, #rgba, #rrggbb, #rrggbbaa) and rgb()/rgba()/
 * hsl()/hsla() in src/client/**\/*.{ts,tsx}. Comments are ignored.
 *
 * Fix a failure by using a token (bg-primary, var(--border),
 * color-mix(in_srgb,var(--shadow-color)_20%,transparent) ...). If a literal
 * genuinely has to stay, add it to ALLOWLIST with a one-line reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_DIR = __dirname;

const EXCLUDED_DIRS = [join("lib", "appearance")];

interface AllowEntry {
  /** Path relative to src/client, with forward slashes. */
  file: string;
  /** Only lines matching this are allowed; omit to allow the whole file. */
  line?: RegExp;
  reason: string;
}

const ALLOWLIST: AllowEntry[] = [
  {
    file: "lib/celebrate.ts",
    reason:
      "canvas-confetti paints on a canvas and needs concrete colours; it cannot resolve CSS variables.",
  },
  {
    file: "components/design-resume/DesignResumeInlineSections.tsx",
    line: /return "#000000";/,
    reason:
      "Fallback for a user-entered resume colour (document data for the PDF), not UI styling.",
  },
];

const HEX = /(?<![\w&#/-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;
const FUNCTIONAL = /(?<![a-z0-9-])(?:rgba?|hsla?)\(/i;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return [];
      return walk(full);
    }
    return [full];
  });
}

const isScanned = (rel: string) =>
  /\.(ts|tsx)$/.test(rel) &&
  !/\.(test|stories)\.(ts|tsx)$/.test(rel) &&
  !rel.endsWith(".d.ts") &&
  !EXCLUDED_DIRS.some((d) => rel === d || rel.startsWith(`${d}${sep}`));

/** Blank out // and /* *\/ comments, keeping line numbers. */
function stripComments(source: string): string[] {
  let inBlock = false;
  return source.split("\n").map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) return out;
        inBlock = false;
        i = end + 2;
        continue;
      }
      const block = line.indexOf("/*", i);
      // A line comment starts at `//` that is not part of a URL (`https://`).
      const lineMatch = /(^|[^:])\/\//.exec(line.slice(i));
      const lineStart =
        lineMatch === null ? -1 : i + lineMatch.index + lineMatch[1].length;
      if (block !== -1 && (lineStart === -1 || block < lineStart)) {
        out += line.slice(i, block);
        inBlock = true;
        i = block + 2;
        continue;
      }
      if (lineStart !== -1) return out + line.slice(i, lineStart);
      return out + line.slice(i);
    }
    return out;
  });
}

function findViolations(): string[] {
  const violations: string[] = [];
  for (const file of walk(CLIENT_DIR)) {
    const rel = relative(CLIENT_DIR, file);
    if (!isScanned(rel)) continue;
    const relPosix = rel.split(sep).join("/");
    const allow = ALLOWLIST.filter((a) => a.file === relPosix);
    stripComments(readFileSync(file, "utf8")).forEach((code, index) => {
      if (!HEX.test(code) && !FUNCTIONAL.test(code)) return;
      const raw = code.trim();
      if (allow.some((a) => !a.line || a.line.test(raw))) return;
      violations.push(`src/client/${relPosix}:${index + 1}: ${raw}`);
    });
  }
  return violations;
}

describe("no hard-coded colours in client code", () => {
  it("uses CSS variables / Tailwind tokens instead of colour literals", () => {
    expect(findViolations()).toEqual([]);
  });

  it("every allowlist entry is still needed", () => {
    for (const entry of ALLOWLIST) {
      const source = readFileSync(join(CLIENT_DIR, entry.file), "utf8");
      const lines = stripComments(source);
      const stillMatches = lines.some(
        (code) =>
          (HEX.test(code) || FUNCTIONAL.test(code)) &&
          (!entry.line || entry.line.test(code.trim())),
      );
      expect(stillMatches, `${entry.file}: ${entry.reason}`).toBe(true);
    }
  });

  it("detects literals and ignores comments and anchors", () => {
    const hits = (src: string) =>
      stripComments(src).filter((l) => HEX.test(l) || FUNCTIONAL.test(l));
    expect(hits('const a = "#fff";')).toHaveLength(1);
    expect(hits('className="bg-[#d9d9d9]"')).toHaveLength(1);
    expect(hits("shadow-[0_1px_rgba(0,0,0,0.2)]")).toHaveLength(1);
    expect(hits("color: hsl(var(--x))")).toHaveLength(1);
    expect(hits("// fixed in #621")).toHaveLength(0);
    expect(hits("/* #fff */ const b = 1;")).toHaveLength(0);
    expect(hits('navigate("/settings#sources")')).toHaveLength(0);
    expect(hits('const u = "https://x.test/a#b";')).toHaveLength(0);
  });
});

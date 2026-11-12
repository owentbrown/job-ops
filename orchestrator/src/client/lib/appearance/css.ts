import { buildTokens } from "./tokens";
import { COLOUR_IDS, RESOLVED_MODES, THEME_IDS } from "./types";

export const APPEARANCE_CSS_COMMAND =
  "npm --prefix orchestrator run appearance:css";

/**
 * Write values the way Biome formats CSS (double quotes, lowercase hex,
 * spaced commas, no trailing .0) so `biome check` accepts the generated file as-is.
 */
const cssValue = (value: string) =>
  value
    .replaceAll("'", '"')
    .replace(/#[0-9a-f]+\b/gi, (hex) => hex.toLowerCase())
    .replace(/,(?=\S)/g, ", ")
    .replace(/(\d)\.0\b/g, "$1");

/**
 * The full contents of src/styles/appearance.generated.css: one block per
 * theme x colour pair x resolved mode (36). Attribute selectors outrank the
 * `:root` / `.dark` fallback blocks in index.css whatever the import order.
 */
export function renderAppearanceCss(): string {
  const blocks: string[] = [];
  for (const theme of THEME_IDS) {
    for (const colours of COLOUR_IDS) {
      for (const mode of RESOLVED_MODES) {
        const body = Object.entries(buildTokens(theme, colours, mode))
          .map(([name, value]) => `  ${name}: ${cssValue(value)};`)
          .join("\n");
        blocks.push(
          `html[data-theme="${theme}"][data-colours="${colours}"][data-mode="${mode}"] {\n${body}\n}`,
        );
      }
    }
  }
  const header = [
    "/*",
    " * generated — do not edit; run",
    ` *   ${APPEARANCE_CSS_COMMAND}`,
    " * Source: src/client/lib/appearance/tokens.ts",
    " */",
  ].join("\n");
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}

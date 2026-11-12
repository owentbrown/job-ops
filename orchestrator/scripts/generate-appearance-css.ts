/**
 * Writes src/styles/appearance.generated.css from the appearance tokens.
 * Usage (from orchestrator/): npm run appearance:css
 *   (or: npx tsx scripts/generate-appearance-css.ts)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAppearanceCss } from "../src/client/lib/appearance/css";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../src/styles/appearance.generated.css");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, renderAppearanceCss());
console.log(`Wrote ${outPath}`);

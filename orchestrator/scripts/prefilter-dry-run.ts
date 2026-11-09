/**
 * Usage (from orchestrator/):
 *   npx tsx scripts/prefilter-dry-run.ts <path-to-COPY-of-jobs.db> [--all]
 * Default: unscored discovered jobs (never manual or restored ones). --all: every discovered or skipped job.
 * Opens the DB read-only and never writes. Always point it at a copy.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { parsePrefilterConfig } from "../src/server/services/prefilter/config";
import { previewRules } from "../src/server/services/prefilter/preview";
import type { PrefilterJob } from "../src/server/services/prefilter/types";

const [dbPath, ...flags] = process.argv.slice(2);
if (!dbPath) {
  console.error(
    "Usage: npx tsx scripts/prefilter-dry-run.ts <copy-of-jobs.db> [--all]",
  );
  process.exit(1);
}

const configPath =
  process.env.PREFILTER_CONFIG_PATH ??
  resolve(process.cwd(), "..", "config", "prefilter.json");
const config = parsePrefilterConfig(
  JSON.parse(readFileSync(configPath, "utf8")),
);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
// Never filter manually added jobs. Restored jobs are excluded too, but only
// if this DB copy already has the filter_layer column (older copies do not).
const hasFilterLayer = (
  db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>
).some((column) => column.name === "filter_layer");
const where = flags.includes("--all")
  ? "status IN ('discovered','skipped') AND source <> 'manual'"
  : `status = 'discovered' AND suitability_score IS NULL AND source <> 'manual'${
      hasFilterLayer
        ? " AND (filter_layer IS NULL OR filter_layer <> 'restored')"
        : ""
    }`;
const rows = db
  .prepare(
    `SELECT id, title, employer, location, is_remote, work_from_home_type, salary,
            salary_max_amount, salary_interval, salary_currency, job_description
     FROM jobs WHERE ${where} ORDER BY discovered_at DESC`,
  )
  .all() as Array<Record<string, unknown>>;
db.close();

const jobs: PrefilterJob[] = rows.map((row) => ({
  id: String(row.id),
  title: String(row.title),
  employer: String(row.employer),
  location: (row.location as string | null) ?? null,
  isRemote: row.is_remote === null ? null : Boolean(row.is_remote),
  workFromHomeType: (row.work_from_home_type as string | null) ?? null,
  salary: (row.salary as string | null) ?? null,
  salaryMaxAmount: (row.salary_max_amount as number | null) ?? null,
  salaryInterval: (row.salary_interval as string | null) ?? null,
  salaryCurrency: (row.salary_currency as string | null) ?? null,
  jobDescription: (row.job_description as string | null) ?? null,
}));

const result = previewRules(jobs, config, Number.POSITIVE_INFINITY);
for (const item of result.items) {
  console.log(
    `${item.decision.padEnd(9)} | ${item.title} @ ${item.employer} | ${item.detail}`,
  );
}
console.log(
  `\n${result.total} jobs: ${result.counts.drop} drop, ${result.counts.keep} keep, ${result.counts.undecided} undecided (→ AI title check)`,
);

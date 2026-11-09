# Pre-score Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paying for full LLM fit-scoring on obviously irrelevant jobs by running a cheap, auditable, config-driven filter (rules, then a batched LLM title check) before the existing scoring step.

**Architecture:** A new pipeline step `prefilterJobsStep` runs between import and scoring. By default it first **pauses the run** (reusing the existing "Scoring paused – Action needed" card and Resume endpoint) so the user can review rules; on Resume it re-reads `config/prefilter.json`, evaluates pure rule functions per job, sends only undecided jobs to a batched title-level LLM check, and marks dropped jobs `status: "skipped"` with new audit columns (`filter_reason`, `filter_layer`, `filtered_at`). It fails closed: a missing/invalid config pauses the run instead of scoring everything. A new `/filtered` page has two tabs: **Filtered jobs** (with Restore) and **Rules** (form editor that writes the JSON file, plus a free rules-only Preview). A **Filter & score backlog** button runs rules → LLM check → full scoring on jobs already in the DB with no discovery and no auto-tailoring. Full scoring (`score-jobs.ts`) is not modified.

**Tech Stack:** TypeScript, Node 22, Express, Drizzle ORM + better-sqlite3, Zod 3, Vitest, React 18 + TanStack Query 5, Tailwind.

---

## Decisions locked in (from review with the user)

| Topic | Decision |
|---|---|
| Hook point | New step between `importJobsStep` and `scoreJobsStep` in `orchestrator.ts` |
| Storage | `status = "skipped"`, plus new columns `filter_reason`, `filter_layer` (`rules` \| `llm` \| `restored`), `filtered_at`. `suitability_reason` is also set to `Filtered (<layer>): <reason>` so the existing job UI shows it |
| Include list | An include hit **overrides** title excludes and skips the LLM check (job goes straight to full scoring). Company, salary, commute and hard-drop description rules still apply |
| Analyst roles | `analyst` is a title exclude |
| Salary | Drop only when a listed **max** converts to below $110K CAD/yr. Hourly × 2080, daily × 260, weekly × 52, monthly × 12. Currency from field/text, else inferred from location (Canada → CAD, US → USD), else CAD. Missing/ambiguous salary never drops |
| Description red flags | `hardDropPhrases` (e.g. "commission only") drop. `flagPhrases` (e.g. "quota") never drop on their own; they are passed to the LLM as hints |
| LLM title check | On by default. Batched (20 jobs per call), title + company + location + first 400 chars. `drop` → filtered; `keep`/`maybe` → full scoring. Any LLM failure → everything passes |
| LLM provider/model | Reuses the `scoring` purpose (Anthropic, `claude-haiku-5-5`). Optional `llm.model` override in config |
| Config location | `config/prefilter.json` at repo root, JSON validated by Zod. Re-read on every pipeline run (and again after Resume). Editable in the UI (Filtered → Rules) or by hand. In Docker, the `config/` directory is mounted read-write via `docker-compose.override.yml` |
| Pause gate | `pauseBeforeScoring` (default **on**, switch in the Rules editor): every normal run pauses after discovery/import and waits for Resume before rules → LLM → scoring. The backlog button does not pause (clicking it is the go-ahead) |
| Fail closed | Missing or invalid config never means "score everything": a normal run pauses with the error; the backlog button refuses to start |
| Rules editor | Form on the Filtered page (one keyword per line, salary fields, LLM settings). Save validates server-side and writes the file atomically. Preview runs the rules only (no LLM, no cost) on the current unscored backlog |
| Backlog run | "Filter & score backlog" button → `runPipeline({ enableCrawling: false, enableImporting: false, enableAutoTailoring: false })`. These flags already exist on `PipelineConfig` but were ignored; the orchestrator now honours `enableCrawling` and `enableAutoTailoring` (no existing caller sets them to false) |
| Automatic runs | None exist today: runs start only from the Run button, the webhook, or `npm run pipeline:run`. A webhook/cron-started run also pauses at the gate |
| Existing discovery filters | Unchanged (location filter and `blockedCompanyKeywords` still drop silently pre-import). Use `companyBlocklist` in the new config for auditable company drops |
| `data/` | Never touched. Tests use temp dirs; dry-run uses a copy |

## File structure

**Create**

| File | Responsibility |
|---|---|
| `config/prefilter.json` | User-editable rules and LLM settings |
| `orchestrator/src/server/services/prefilter/types.ts` | `PrefilterJob` type shared by prefilter modules |
| `orchestrator/src/server/services/prefilter/config.ts` | Zod schema, `parsePrefilterConfig`, `readPrefilterConfig` (fail-closed status), `writePrefilterConfig` (atomic save) |
| `orchestrator/src/server/services/prefilter/text-match.ts` | Word-boundary keyword/phrase matching |
| `orchestrator/src/server/services/prefilter/salary.ts` | Salary parsing, currency/interval normalisation, floor check |
| `orchestrator/src/server/services/prefilter/rules.ts` | `evaluateRules` – the no-LLM layer |
| `orchestrator/src/server/services/prefilter/preview.ts` | `previewRules` – rules-only what-if, shared by the API and dry-run script |
| `orchestrator/src/client/pages/filtered/prefilter-form.ts` | Pure config ⇄ form-state conversion |
| `orchestrator/src/client/pages/filtered/PrefilterRulesEditor.tsx` | Rules tab: form, Save, Preview, Resume |
| `orchestrator/src/server/services/prefilter/llm-title-check.ts` | Batched cheap LLM keep/drop/maybe |
| `orchestrator/src/server/repositories/prefilter.ts` | `markJobFiltered`, `listFilteredJobs`, `restoreFilteredJob` |
| `orchestrator/src/server/pipeline/steps/prefilter-jobs.ts` | The pipeline step |
| `orchestrator/src/server/api/routes/prefilter.ts` | `GET /api/prefilter/jobs`, `POST /api/prefilter/jobs/:id/restore` |
| `orchestrator/src/client/api/prefilter.ts` | Client API calls |
| `orchestrator/src/client/pages/FilteredJobsPage.tsx` | Filtered view + Restore |
| `orchestrator/scripts/prefilter-dry-run.ts` | Read-only what-if against a DB copy |
| `docker-compose.override.yml` | Local image tag + config mount |
| Tests: `*.test.ts` next to each server module above | |

**Modify (existing upstream files — keep edits minimal)**

| File | Change |
|---|---|
| `shared/src/types/jobs.ts` | Add `PrefilterLayer` type + 3 optional fields on `Job` |
| `orchestrator/src/server/db/schema.ts` | 3 columns on `jobs` |
| `orchestrator/src/server/db/migrate.ts` | 3 `ALTER TABLE` lines |
| `orchestrator/src/server/repositories/jobs.ts` | 3 lines in `mapRowToJob` |
| `orchestrator/src/server/pipeline/orchestrator.ts` | 1 import, the step call with a pause callback (~20 lines), `skipPrefilterReview` option, skip discovery when `enableCrawling === false`, skip selection/tailoring when `enableAutoTailoring === false` |
| `shared/src/types/pipeline.ts` | 2 optional progress fields (`actionTitle`, `actionLabel`) |
| `orchestrator/src/client/components/PipelineProgressCard.tsx` | Use those fields for the pause card's title/button (2 lines) |
| `orchestrator/src/server/api/routes.ts` | 1 import + 1 `use` |
| `orchestrator/src/client/api/client.ts` | 1 export line |
| `orchestrator/src/client/App.tsx` | 1 import + 1 route |
| `orchestrator/src/client/components/navigation.ts` | 1 icon import + 1 nav item |

---

### Task 0: Environment and baseline

**Files:** none

- [ ] **Step 1: Use Node 22** (repo pins 22.22.1 via Volta; local default is 24, which breaks `better-sqlite3`)

```bash
volta install node@22.22.1 || nvm install 22.22.1 && nvm use 22.22.1
node -v
```
Expected: `v22.22.1`

- [ ] **Step 2: Install and confirm branch**

```bash
cd /Users/owenbrown/Documents/Claude/job-ops
git status && git branch --show-current
npm ci
```
Expected: branch `my-changes`, clean tree, install succeeds. If tests later fail with a Node ABI error: `npm --workspace orchestrator rebuild better-sqlite3`.

- [ ] **Step 3: Baseline the areas we touch**

```bash
npm --workspace orchestrator run test:run -- src/server/pipeline src/server/repositories
```
Expected: PASS. Record any pre-existing failures so they are not blamed on this work.

> **Formatting note for every task:** code blocks in this plan are not guaranteed to match Biome's formatter exactly. Before each commit, run `npm run format:all` and then `./orchestrator/node_modules/.bin/biome ci .` on the changed files' workspace; commit the formatted result.

---

### Task 1: Storage columns and shared type

**Files:**
- Modify: `shared/src/types/jobs.ts` (after the `JobStatus` type, and inside `interface Job` after `sponsorMatchNames`)
- Modify: `orchestrator/src/server/db/schema.ts` (inside `jobs` table, after `sponsorMatchNames: text("sponsor_match_names"),`)
- Modify: `orchestrator/src/server/db/migrate.ts` (append to the end of the `migrations` array, just before the closing `];` that precedes `console.log("🔧 Running database migrations...");`)
- Modify: `orchestrator/src/server/repositories/jobs.ts` (`mapRowToJob`, after `sponsorMatchNames`)

- [ ] **Step 1: Add the shared type**

In `shared/src/types/jobs.ts`, directly after the `JobStatus` union:

```ts
/** Which pre-score filter layer acted on a job. "restored" = user un-filtered it; never re-filter. */
export type PrefilterLayer = "rules" | "llm" | "restored";
```

Inside `interface Job`, directly after the `sponsorMatchNames` line:

```ts
  filterReason?: string | null; // Pre-score filter reason (kept after restore for history)
  filterLayer?: PrefilterLayer | null; // rules | llm | restored
  filteredAt?: string | null; // ISO timestamp when filtered
```

(Optional so `createJob` factories, demo data and list types need no changes.)

- [ ] **Step 2: Add the Drizzle columns**

In `orchestrator/src/server/db/schema.ts`, after `sponsorMatchNames: text("sponsor_match_names"),`:

```ts
    // Pre-score filter audit (fork: prescore-filter)
    filterReason: text("filter_reason"),
    filterLayer: text("filter_layer", { enum: ["rules", "llm", "restored"] }),
    filteredAt: text("filtered_at"),
```

- [ ] **Step 3: Add the migration lines**

At the end of the `migrations` array in `orchestrator/src/server/db/migrate.ts`:

```ts
  // Pre-score filter audit columns (fork: prescore-filter)
  `ALTER TABLE jobs ADD COLUMN filter_reason TEXT`,
  `ALTER TABLE jobs ADD COLUMN filter_layer TEXT`,
  `ALTER TABLE jobs ADD COLUMN filtered_at TEXT`,
```

The migration runner already treats `duplicate column name` on `ALTER TABLE jobs ADD COLUMN` as "already applied", so re-runs are safe.

- [ ] **Step 4: Map the columns**

In `mapRowToJob` in `orchestrator/src/server/repositories/jobs.ts`, after `sponsorMatchNames: ...`:

```ts
    filterReason: row.filterReason ?? null,
    filterLayer: (row.filterLayer as Job["filterLayer"]) ?? null,
    filteredAt: row.filteredAt ?? null,
```

- [ ] **Step 5: Type-check**

```bash
npm run check:types:shared && npm --workspace orchestrator run check:types
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/src/types/jobs.ts orchestrator/src/server/db/schema.ts orchestrator/src/server/db/migrate.ts orchestrator/src/server/repositories/jobs.ts
git commit -m "feat(prefilter): add filter audit columns to jobs"
```

---

### Task 2: Prefilter repository

**Files:**
- Create: `orchestrator/src/server/repositories/prefilter.ts`
- Test: `orchestrator/src/server/repositories/prefilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("prefilter repository", () => {
  let tempDir: string;
  let jobsRepo: Awaited<typeof import("./jobs")>;
  let prefilterRepo: Awaited<typeof import("./prefilter")>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-repo-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    await import("../db/migrate");
    jobsRepo = await import("./jobs");
    prefilterRepo = await import("./prefilter");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function makeJob(suffix: string) {
    return jobsRepo.createJob({
      source: "manual",
      title: `Business Analyst ${suffix}`,
      employer: "Acme",
      jobUrl: `https://example.com/job/${suffix}`,
    });
  }

  it("marks a discovered job as filtered with audit fields", async () => {
    const job = await makeJob("a");
    const changed = await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "rules",
      reason: "title keyword 'analyst'",
    });
    expect(changed).toBe(true);

    const updated = await jobsRepo.getJobById(job.id);
    expect(updated?.status).toBe("skipped");
    expect(updated?.filterLayer).toBe("rules");
    expect(updated?.filterReason).toBe("title keyword 'analyst'");
    expect(updated?.filteredAt).toEqual(expect.any(String));
    expect(updated?.suitabilityReason).toBe(
      "Filtered (rules): title keyword 'analyst'",
    );
    expect(updated?.suitabilityScore).toBeNull();
  });

  it("does not filter a job that is no longer discovered", async () => {
    const job = await makeJob("b");
    await jobsRepo.updateJob(job.id, { status: "applied" });
    const changed = await prefilterRepo.markJobFiltered({
      id: job.id,
      layer: "llm",
      reason: "irrelevant",
    });
    expect(changed).toBe(false);
    expect((await jobsRepo.getJobById(job.id))?.status).toBe("applied");
  });

  it("lists filtered jobs and restores one", async () => {
    const a = await makeJob("c");
    const b = await makeJob("d");
    await prefilterRepo.markJobFiltered({ id: a.id, layer: "rules", reason: "r1" });
    await prefilterRepo.markJobFiltered({ id: b.id, layer: "llm", reason: "r2" });

    const listed = await prefilterRepo.listFilteredJobs();
    expect(listed.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());

    expect(await prefilterRepo.restoreFilteredJob(a.id)).toBe(true);
    const restored = await jobsRepo.getJobById(a.id);
    expect(restored?.status).toBe("discovered");
    expect(restored?.filterLayer).toBe("restored");
    expect(restored?.filterReason).toBe("r1");
    expect(restored?.suitabilityReason).toBeNull();

    const listedAfter = await prefilterRepo.listFilteredJobs();
    expect(listedAfter.map((j) => j.id)).toEqual([b.id]);

    expect(await prefilterRepo.restoreFilteredJob(a.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/repositories/prefilter.test.ts
```
Expected: FAIL — cannot resolve `./prefilter`.

- [ ] **Step 3: Implement the repository**

`orchestrator/src/server/repositories/prefilter.ts`:

```ts
import type { PrefilterLayer } from "@shared/types";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index";
import { privateDataScopeFilter } from "../tenancy/private-scope";

const { jobs } = schema;

export type FilteredJobSummary = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  salary: string | null;
  jobUrl: string;
  filterReason: string | null;
  filterLayer: PrefilterLayer | null;
  filteredAt: string | null;
  discoveredAt: string;
};

const ACTIVE_FILTER_LAYERS = ["rules", "llm"] as const;

export async function markJobFiltered(input: {
  id: string;
  layer: "rules" | "llm";
  reason: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(jobs)
    .set({
      status: "skipped",
      suitabilityReason: `Filtered (${input.layer}): ${input.reason}`,
      filterReason: input.reason,
      filterLayer: input.layer,
      filteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.id, input.id),
        eq(jobs.status, "discovered"),
      ),
    );
  return result.changes > 0;
}

export async function listFilteredJobs(): Promise<FilteredJobSummary[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      employer: jobs.employer,
      location: jobs.location,
      salary: jobs.salary,
      jobUrl: jobs.jobUrl,
      filterReason: jobs.filterReason,
      filterLayer: jobs.filterLayer,
      filteredAt: jobs.filteredAt,
      discoveredAt: jobs.discoveredAt,
    })
    .from(jobs)
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.status, "skipped"),
        inArray(jobs.filterLayer, [...ACTIVE_FILTER_LAYERS]),
      ),
    )
    .orderBy(desc(jobs.filteredAt));
  return rows.map((row) => ({
    ...row,
    filterLayer: (row.filterLayer as PrefilterLayer | null) ?? null,
  }));
}

/** Put a filtered job back in the scoring queue. filterReason is kept for history. */
export async function restoreFilteredJob(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(jobs)
    .set({
      status: "discovered",
      suitabilityReason: null,
      filterLayer: "restored",
      updatedAt: now,
    })
    .where(
      and(
        privateDataScopeFilter(jobs),
        eq(jobs.id, id),
        eq(jobs.status, "skipped"),
        inArray(jobs.filterLayer, [...ACTIVE_FILTER_LAYERS]),
      ),
    );
  return result.changes > 0;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/repositories/prefilter.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/repositories/prefilter.ts orchestrator/src/server/repositories/prefilter.test.ts
git commit -m "feat(prefilter): add repository for marking, listing and restoring filtered jobs"
```

---

### Task 3: Config schema, loader and the config file

**Files:**
- Create: `orchestrator/src/server/services/prefilter/types.ts`
- Create: `orchestrator/src/server/services/prefilter/config.ts`
- Create: `config/prefilter.json`
- Test: `orchestrator/src/server/services/prefilter/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePrefilterConfig,
  readPrefilterConfig,
  writePrefilterConfig,
} from "./config";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("parsePrefilterConfig", () => {
  it("applies defaults for an empty object", () => {
    const config = parsePrefilterConfig({});
    expect(config.enabled).toBe(true);
    expect(config.pauseBeforeScoring).toBe(true);
    expect(config.title.include).toEqual([]);
    expect(config.salary.floorAnnualCad).toBe(110000);
    expect(config.salary.hoursPerYear).toBe(2080);
    expect(config.salary.defaultCurrency).toBe("CAD");
    expect(config.llm.enabled).toBe(false);
    expect(config.llm.batchSize).toBe(20);
    expect(config.llm.descriptionChars).toBe(400);
  });

  it("rejects unknown keys so typos are caught", () => {
    expect(() => parsePrefilterConfig({ titel: {} })).toThrow();
  });

  it("allows _comment keys", () => {
    expect(() =>
      parsePrefilterConfig({ _comment: "notes", title: { _comment: "x" } }),
    ).not.toThrow();
  });
});

describe("readPrefilterConfig / writePrefilterConfig", () => {
  const originalPath = process.env.PREFILTER_CONFIG_PATH;
  let dir: string | null = null;

  async function tempFile(contents?: string): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "prefilter-config-"));
    const file = join(dir, "prefilter.json");
    if (contents !== undefined) await writeFile(file, contents);
    process.env.PREFILTER_CONFIG_PATH = file;
    return file;
  }

  afterEach(async () => {
    if (originalPath === undefined) delete process.env.PREFILTER_CONFIG_PATH;
    else process.env.PREFILTER_CONFIG_PATH = originalPath;
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("is off under test when no explicit path is set", async () => {
    delete process.env.PREFILTER_CONFIG_PATH;
    expect(await readPrefilterConfig()).toEqual({ status: "off-in-tests" });
  });

  it("loads and validates the file at PREFILTER_CONFIG_PATH", async () => {
    const file = await tempFile(JSON.stringify({ title: { exclude: ["analyst"] } }));
    const load = await readPrefilterConfig();
    expect(load.status).toBe("ok");
    expect(load.status === "ok" && load.config.title.exclude).toEqual(["analyst"]);
    expect(load.status === "ok" && load.path).toBe(file);
  });

  it("reports a missing file", async () => {
    const file = await tempFile();
    expect(await readPrefilterConfig()).toEqual({ status: "missing", path: file });
  });

  it("reports invalid JSON and schema errors with a readable message", async () => {
    await tempFile("{ not json");
    expect((await readPrefilterConfig()).status).toBe("invalid");

    await tempFile(JSON.stringify({ titel: {} }));
    const load = await readPrefilterConfig();
    expect(load.status).toBe("invalid");
    expect(load.status === "invalid" && load.error).toMatch(/titel/);
  });

  it("writes a validated config atomically and reads it back", async () => {
    const file = await tempFile();
    const saved = await writePrefilterConfig({ title: { exclude: ["intern"] } });
    expect(saved.path).toBe(file);
    expect(saved.config.salary.floorAnnualCad).toBe(110000);
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    expect(onDisk.title.exclude).toEqual(["intern"]);
  });

  it("does not touch the file when the new config is invalid", async () => {
    const file = await tempFile(JSON.stringify({ enabled: true }));
    await expect(writePrefilterConfig({ enabled: "yes" })).rejects.toThrow();
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ enabled: true });
  });

  it("refuses to write under test without an explicit path", async () => {
    delete process.env.PREFILTER_CONFIG_PATH;
    await expect(writePrefilterConfig({})).rejects.toThrow(/PREFILTER_CONFIG_PATH/);
  });

  it("the committed config/prefilter.json is valid", async () => {
    process.env.PREFILTER_CONFIG_PATH = resolve(
      __dirname,
      "../../../../../config/prefilter.json",
    );
    const load = await readPrefilterConfig();
    expect(load.status).toBe("ok");
    expect(load.status === "ok" && load.config.llm.enabled).toBe(true);
    expect(load.status === "ok" && load.config.pauseBeforeScoring).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/config.test.ts
```
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Create the shared prefilter type**

`orchestrator/src/server/services/prefilter/types.ts`:

```ts
import type { Job } from "@shared/types";

/** The job fields the prefilter reads. Full Job objects satisfy this. */
export type PrefilterJob = Pick<
  Job,
  | "id"
  | "title"
  | "employer"
  | "location"
  | "isRemote"
  | "workFromHomeType"
  | "salary"
  | "salaryMaxAmount"
  | "salaryInterval"
  | "salaryCurrency"
  | "jobDescription"
>;
```

- [ ] **Step 4: Implement the config module**

`orchestrator/src/server/services/prefilter/config.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "@infra/logger";
import { z } from "zod";

const comment = { _comment: z.string().optional() };
const keywordList = z.array(z.string().trim().min(1)).default([]);

export const prefilterConfigSchema = z
  .object({
    ...comment,
    enabled: z.boolean().default(true),
    pauseBeforeScoring: z.boolean().default(true),
    title: z
      .object({ ...comment, include: keywordList, exclude: keywordList })
      .strict()
      .default({}),
    companyBlocklist: keywordList,
    location: z
      .object({ ...comment, commuteBlocklist: keywordList })
      .strict()
      .default({}),
    salary: z
      .object({
        ...comment,
        enabled: z.boolean().default(true),
        floorAnnualCad: z.number().positive().default(110000),
        hoursPerYear: z.number().positive().default(2080),
        defaultCurrency: z.string().trim().toUpperCase().default("CAD"),
        ratesToCad: z
          .record(z.string(), z.number().positive())
          .default({ CAD: 1 }),
      })
      .strict()
      .default({}),
    description: z
      .object({
        ...comment,
        hardDropPhrases: keywordList,
        flagPhrases: keywordList,
      })
      .strict()
      .default({}),
    llm: z
      .object({
        ...comment,
        enabled: z.boolean().default(false),
        batchSize: z.number().int().min(1).max(50).default(20),
        descriptionChars: z.number().int().min(0).max(2000).default(400),
        model: z.string().trim().min(1).nullable().default(null),
        targetRoles: z.string().trim().default(""),
        hardPasses: z.string().trim().default(""),
      })
      .strict()
      .default({}),
  })
  .strict();

export type PrefilterConfig = z.infer<typeof prefilterConfigSchema>;

export function parsePrefilterConfig(raw: unknown): PrefilterConfig {
  return prefilterConfigSchema.parse(raw);
}

export type PrefilterConfigLoad =
  | { status: "ok"; config: PrefilterConfig; path: string }
  | { status: "off-in-tests" }
  | { status: "missing"; path: string }
  | { status: "invalid"; path: string; error: string };

export function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

function defaultPrefilterConfigPath(): string {
  // cwd is orchestrator/ natively and /app/orchestrator in Docker.
  return resolve(process.cwd(), "..", "config", "prefilter.json");
}

/**
 * PREFILTER_CONFIG_PATH wins. Otherwise <cwd>/../config/prefilter.json, or
 * <cwd>/config/prefilter.json if only that exists. Under NODE_ENV=test with no
 * explicit path this returns null, so existing pipeline tests see a no-op step
 * and tests can never write the real repo file.
 */
export function resolvePrefilterConfigPath(): string | null {
  const explicit = process.env.PREFILTER_CONFIG_PATH?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "test") return null;
  const primary = defaultPrefilterConfigPath();
  const secondary = resolve(process.cwd(), "config", "prefilter.json");
  return !existsSync(primary) && existsSync(secondary) ? secondary : primary;
}

export async function readPrefilterConfig(): Promise<PrefilterConfigLoad> {
  const path = resolvePrefilterConfigPath();
  if (!path) return { status: "off-in-tests" };
  if (!existsSync(path)) return { status: "missing", path };
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return { status: "ok", path, config: parsePrefilterConfig(raw) };
  } catch (error) {
    const message = formatConfigError(error);
    logger.error("Prefilter config invalid", { path, error: message });
    return { status: "invalid", path, error: message };
  }
}

/** Validates first, then writes via temp file + rename so a bad save never corrupts the file. */
export async function writePrefilterConfig(
  raw: unknown,
): Promise<{ config: PrefilterConfig; path: string }> {
  const config = parsePrefilterConfig(raw);
  const path = resolvePrefilterConfigPath();
  if (!path) {
    throw new Error("No prefilter config path; set PREFILTER_CONFIG_PATH");
  }
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
  return { config, path };
}
```

(Saving from the UI rewrites the file with every default filled in and one array item per line. `_comment` keys are kept.)

- [ ] **Step 5: Create the config file**

`config/prefilter.json`:

```json
{
  "_comment": "Pre-score filter. Edit here or in the app (Filtered -> Rules). Re-read at the start of every pipeline run and after Resume. Keywords are case-insensitive whole-word matches (a trailing 's' is allowed). Bias: when unsure, let the job through.",
  "enabled": true,
  "pauseBeforeScoring": true,
  "title": {
    "_comment": "An include hit overrides excludes and skips the LLM check (goes straight to full scoring).",
    "include": [
      "product manager", "product management", "product owner", "product lead",
      "head of product", "product operations", "product ops", "product strategy",
      "product-led growth", "plg", "growth", "go-to-market", "gtm", "bizops",
      "business operations", "strategy and operations", "strategy & operations",
      "strategy & ops"
    ],
    "exclude": [
      "analyst", "intern", "internship", "co-op", "student", "specialist",
      "technician", "electrician", "electrical", "mechanic", "mechanical",
      "driver", "nurse", "physician", "therapist", "pharmacist", "teacher",
      "tutor", "cashier", "barista", "cook", "chef", "warehouse", "forklift",
      "labourer", "laborer", "deckhand", "sales representative", "sales rep",
      "sales associate", "account executive", "account manager",
      "sales development", "business development representative", "sdr", "bdr",
      "inside sales", "seo", "email marketing", "demand generation",
      "demand gen", "content marketing", "social media", "copywriter",
      "project manager", "project coordinator", "project management",
      "coordinator", "receptionist", "administrative assistant",
      "executive assistant", "customer support", "customer service",
      "support agent", "help desk", "accountant", "bookkeeper", "payroll",
      "recruiter", "paralegal", "lawyer", "court", "victim",
      "software engineer", "software developer", "data engineer",
      "basketball", "hockey"
    ]
  },
  "companyBlocklist": [],
  "location": {
    "_comment": "Dropped only when the job is NOT remote and the location mentions one of these.",
    "commuteBlocklist": [
      "toronto", "mississauga", "markham", "vaughan", "north york",
      "etobicoke", "scarborough", "richmond hill", "brampton", "oakville"
    ]
  },
  "salary": {
    "_comment": "Drop only when a listed MAX converts below the floor. Missing or ambiguous salary never drops. Update rates occasionally.",
    "enabled": true,
    "floorAnnualCad": 110000,
    "hoursPerYear": 2080,
    "defaultCurrency": "CAD",
    "ratesToCad": { "CAD": 1, "USD": 1.37, "GBP": 1.72, "EUR": 1.5 }
  },
  "description": {
    "_comment": "hardDropPhrases drop. flagPhrases never drop; they are shown to the LLM check as hints.",
    "hardDropPhrases": [
      "commission only", "commission-only", "100% commission",
      "straight commission", "commission based only"
    ],
    "flagPhrases": [
      "commission", "quota", "on-target earnings", "ote", "cold calling",
      "cold call", "client services", "agency", "5 days in office",
      "five days a week in office", "in-office"
    ]
  },
  "llm": {
    "_comment": "Cheap batched title check on jobs the rules did not decide. drop = filtered; keep/maybe = full scoring. model null = use the scoring model.",
    "enabled": true,
    "batchSize": 20,
    "descriptionChars": 400,
    "model": null,
    "targetRoles": "Product Manager, Associate Product Manager, Product Operations, Product Strategy, Growth Manager, Growth Strategy, Go-to-Market Strategy, BizOps / Business Operations, Strategy and Operations, Product-Led Growth. Locations: fully remote in Canada, or hybrid in Kitchener-Waterloo, Ontario. Industries: tech, SaaS, fintech, health tech. Best fit: roles mixing strategy with hands-on execution ownership, zero-to-one building, fast-moving AI-forward teams.",
    "hardPasses": "Sales-heavy roles (quota, commission, SDR/BDR, account executive); marketing execution (SEO, email, demand gen, content, social); agency or client-services studios; project management; pure operations roles with no strategy component (facilities, logistics, sports or event operations); roles requiring a regular Toronto commute; anything outside business and product functions (trades, clinical, legal, retail, hospitality, marine, software engineering)."
  }
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/config.test.ts
```
Expected: PASS (11 tests).

- [ ] **Step 7: Commit**

```bash
git add config/prefilter.json orchestrator/src/server/services/prefilter/types.ts orchestrator/src/server/services/prefilter/config.ts orchestrator/src/server/services/prefilter/config.test.ts
git commit -m "feat(prefilter): add JSON config file, schema and loader"
```

---

### Task 4: Keyword matching

**Files:**
- Create: `orchestrator/src/server/services/prefilter/text-match.ts`
- Test: `orchestrator/src/server/services/prefilter/text-match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findKeyword, findKeywords, normalizeText } from "./text-match";

describe("findKeyword", () => {
  it("matches whole words case-insensitively", () => {
    expect(findKeyword("Senior Business Analyst", ["analyst"])).toBe("analyst");
  });

  it("allows a trailing s", () => {
    expect(findKeyword("Data Analysts wanted", ["analyst"])).toBe("analyst");
  });

  it("does not match inside other words", () => {
    expect(findKeyword("Internal Communications Lead", ["intern"])).toBeNull();
    expect(findKeyword("International Growth Manager", ["intern"])).toBeNull();
  });

  it("matches multi-word and punctuated phrases", () => {
    expect(findKeyword("Head of Go-To-Market", ["go-to-market"])).toBe("go-to-market");
    expect(findKeyword("Strategy & Operations Lead", ["strategy & operations"])).toBe(
      "strategy & operations",
    );
    expect(findKeyword("This is a commission-only role.", ["commission-only"])).toBe(
      "commission-only",
    );
  });

  it("returns the first keyword in list order", () => {
    expect(findKeyword("Criminal Court Victim Specialist", ["specialist", "court"])).toBe(
      "specialist",
    );
  });

  it("handles null text and empty lists", () => {
    expect(findKeyword(null, ["x"])).toBeNull();
    expect(findKeyword("anything", [])).toBeNull();
  });
});

describe("findKeywords", () => {
  it("returns every matching keyword", () => {
    expect(findKeywords("Base salary plus commission and quota", ["commission", "quota", "ote"])).toEqual([
      "commission",
      "quota",
    ]);
  });
});

describe("normalizeText", () => {
  it("lowercases, unifies dashes and collapses whitespace", () => {
    expect(normalizeText("  Go–To   Market ")).toBe("go-to market");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/text-match.test.ts
```
Expected: FAIL — cannot resolve `./text-match`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/services/prefilter/text-match.ts`:

```ts
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp>();

function keywordPattern(keyword: string): RegExp {
  const cached = patternCache.get(keyword);
  if (cached) return cached;
  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(keyword)}s?([^a-z0-9]|$)`,
  );
  patternCache.set(keyword, pattern);
  return pattern;
}

/** First keyword (in list order) that appears as a whole word/phrase, else null. */
export function findKeyword(
  text: string | null | undefined,
  keywords: string[],
): string | null {
  const haystack = normalizeText(text);
  if (!haystack) return null;
  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (needle && keywordPattern(needle).test(haystack)) return keyword;
  }
  return null;
}

export function findKeywords(
  text: string | null | undefined,
  keywords: string[],
): string[] {
  const haystack = normalizeText(text);
  if (!haystack) return [];
  return keywords.filter((keyword) => {
    const needle = normalizeText(keyword);
    return needle.length > 0 && keywordPattern(needle).test(haystack);
  });
}
```

(The pattern cache is module-level but holds only regexes built from config strings — no tenant data.)

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/text-match.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/services/prefilter/text-match.ts orchestrator/src/server/services/prefilter/text-match.test.ts
git commit -m "feat(prefilter): add whole-word keyword matching"
```

---

### Task 5: Salary floor check

**Files:**
- Create: `orchestrator/src/server/services/prefilter/salary.ts`
- Test: `orchestrator/src/server/services/prefilter/salary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { evaluateSalary, parseSalaryText } from "./salary";

const salaryConfig = parsePrefilterConfig({
  salary: { ratesToCad: { CAD: 1, USD: 1.37 } },
}).salary;

function job(overrides: Parameters<typeof createJob>[0]) {
  return createJob({
    salary: null,
    salaryMaxAmount: null,
    salaryInterval: null,
    salaryCurrency: null,
    location: null,
    ...overrides,
  });
}

describe("parseSalaryText", () => {
  it("parses hourly", () => {
    expect(parseSalaryText("$30 - $45 an hour")).toEqual({
      max: 45,
      interval: "hourly",
      currency: null,
    });
  });
  it("parses yearly ranges with commas", () => {
    expect(parseSalaryText("$90,000 - $120,000 a year")).toEqual({
      max: 120000,
      interval: "yearly",
      currency: null,
    });
  });
  it("parses K shorthand and explicit currency", () => {
    expect(parseSalaryText("CA$95K–105K")).toEqual({
      max: 105000,
      interval: null,
      currency: "CAD",
    });
    expect(parseSalaryText("US$45/hr")).toEqual({
      max: 45,
      interval: "hourly",
      currency: "USD",
    });
  });
  it("returns null for text without a currency marker", () => {
    expect(parseSalaryText("Competitive")).toBeNull();
    expect(parseSalaryText("401k matching")).toBeNull();
  });
});

describe("evaluateSalary", () => {
  it("drops $45/hr in Ontario (93.6K CAD)", () => {
    const result = evaluateSalary(
      job({ salary: "$45/hr", location: "Waterloo, ON" }),
      salaryConfig,
    );
    expect(result.belowFloor).toBe(true);
    expect(result.annualMaxCad).toBe(93600);
  });

  it("defaults to CAD when currency and country are unknown", () => {
    expect(evaluateSalary(job({ salary: "$45/hr" }), salaryConfig).belowFloor).toBe(true);
  });

  it("keeps US$45/hr (~128K CAD)", () => {
    const result = evaluateSalary(job({ salary: "US$45/hr" }), salaryConfig);
    expect(result.belowFloor).toBe(false);
  });

  it("infers USD from a US location", () => {
    const result = evaluateSalary(
      job({ salaryMaxAmount: 100000, salaryInterval: "yearly", location: "Austin, TX, United States" }),
      salaryConfig,
    );
    expect(result.annualMaxCad).toBe(137000);
    expect(result.belowFloor).toBe(false);
  });

  it("drops a structured CAD max below the floor", () => {
    const result = evaluateSalary(
      job({ salaryMaxAmount: 95000, salaryInterval: "yearly", salaryCurrency: "CAD" }),
      salaryConfig,
    );
    expect(result.belowFloor).toBe(true);
  });

  it("never drops when salary is missing or ambiguous", () => {
    expect(evaluateSalary(job({}), salaryConfig).belowFloor).toBe(false);
    expect(evaluateSalary(job({ salary: "$500" }), salaryConfig).belowFloor).toBe(false);
    expect(
      evaluateSalary(job({ salaryMaxAmount: 50000, salaryCurrency: "JPY", salaryInterval: "yearly" }), salaryConfig)
        .belowFloor,
    ).toBe(false);
  });

  it("does nothing when salary checks are disabled", () => {
    const disabled = { ...salaryConfig, enabled: false };
    expect(evaluateSalary(job({ salary: "$20/hr" }), disabled).belowFloor).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/salary.test.ts
```
Expected: FAIL — cannot resolve `./salary`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/services/prefilter/salary.ts`:

```ts
import type { PrefilterConfig } from "./config";
import { normalizeText } from "./text-match";
import type { PrefilterJob } from "./types";

type SalaryInterval = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export type ParsedSalary = {
  max: number;
  interval: SalaryInterval | null;
  currency: string | null;
};

export type SalaryCheck = {
  annualMaxCad: number | null;
  belowFloor: boolean;
  detail: string;
};

const NO_DECISION: SalaryCheck = {
  annualMaxCad: null,
  belowFloor: false,
  detail: "no usable salary",
};

export function normalizeInterval(raw: string | null | undefined): SalaryInterval | null {
  const value = normalizeText(raw);
  if (!value) return null;
  if (/hour/.test(value)) return "hourly";
  if (/day|daily/.test(value)) return "daily";
  if (/week/.test(value)) return "weekly";
  if (/month/.test(value)) return "monthly";
  if (/year|annual|annum/.test(value)) return "yearly";
  return null;
}

function currencyFromText(text: string): string | null {
  if (/us\$|\busd\b/.test(text)) return "USD";
  if (/ca\$|c\$|\bcad\b/.test(text)) return "CAD";
  if (/£|\bgbp\b/.test(text)) return "GBP";
  if (/€|\beur\b/.test(text)) return "EUR";
  return null;
}

function intervalFromText(text: string): SalaryInterval | null {
  if (/\/\s*(hr|hour|h)\b|per hour|an hour|hourly/.test(text)) return "hourly";
  if (/per day|a day|\/\s*day|daily/.test(text)) return "daily";
  if (/per week|a week|\/\s*(wk|week)|weekly/.test(text)) return "weekly";
  if (/per month|a month|\/\s*(mo|month)|monthly/.test(text)) return "monthly";
  if (/per year|a year|\/\s*(yr|year)|annual|annum|yearly/.test(text)) return "yearly";
  return null;
}

/** Conservative free-text parse. Only runs when a currency marker is present. */
export function parseSalaryText(text: string | null | undefined): ParsedSalary | null {
  const value = normalizeText(text);
  if (!value || !/[$£€]|\b(cad|usd|gbp|eur)\b/.test(value)) return null;
  const amounts: number[] = [];
  for (const match of value.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/g)) {
    let amount = Number(match[1].replace(/,/g, ""));
    if (match[2]) amount *= 1000;
    if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
  }
  if (amounts.length === 0) return null;
  return {
    max: Math.max(...amounts),
    interval: intervalFromText(value),
    currency: currencyFromText(value),
  };
}

export function inferCurrencyFromLocation(location: string | null | undefined): string | null {
  const value = normalizeText(location);
  if (!value) return null;
  if (/canada|ontario|british columbia|alberta|quebec|\b(on|bc|ab|qc|mb|sk|ns|nb|nl|pe)\b/.test(value)) {
    return "CAD";
  }
  if (/united states|\busa\b|\bu\.s\.|, us\b/.test(value)) return "USD";
  return null;
}

function multiplier(interval: SalaryInterval, hoursPerYear: number): number {
  switch (interval) {
    case "hourly":
      return hoursPerYear;
    case "daily":
      return 260;
    case "weekly":
      return 52;
    case "monthly":
      return 12;
    case "yearly":
      return 1;
  }
}

function pickSalary(job: PrefilterJob): (ParsedSalary & { source: string }) | null {
  if (typeof job.salaryMaxAmount === "number" && job.salaryMaxAmount > 0) {
    return {
      max: job.salaryMaxAmount,
      interval: normalizeInterval(job.salaryInterval),
      currency: job.salaryCurrency?.trim().toUpperCase() || null,
      source: "structured",
    };
  }
  const parsed = parseSalaryText(job.salary);
  return parsed ? { ...parsed, source: `"${job.salary}"` } : null;
}

export function evaluateSalary(
  job: PrefilterJob,
  config: PrefilterConfig["salary"],
): SalaryCheck {
  if (!config.enabled) return NO_DECISION;

  const picked = pickSalary(job);
  if (!picked) return NO_DECISION;
  const { max, currency, source } = picked;
  let { interval } = picked;

  if (!interval) {
    if (max >= 10000) interval = "yearly";
    else if (max < 200) interval = "hourly";
    else return NO_DECISION;
  }

  const resolvedCurrency =
    currency ?? inferCurrencyFromLocation(job.location) ?? config.defaultCurrency;
  const rate = config.ratesToCad[resolvedCurrency];
  if (rate === undefined) return NO_DECISION;

  const annualMaxCad = Math.round(max * multiplier(interval, config.hoursPerYear) * rate);
  return {
    annualMaxCad,
    belowFloor: annualMaxCad < config.floorAnnualCad,
    detail: `${source} ≈ $${Math.round(annualMaxCad / 1000)}K CAD/yr (${interval}, ${resolvedCurrency})`,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/salary.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/services/prefilter/salary.ts orchestrator/src/server/services/prefilter/salary.test.ts
git commit -m "feat(prefilter): add salary floor check with hourly and currency conversion"
```

---

### Task 6: Rules layer

**Files:**
- Create: `orchestrator/src/server/services/prefilter/rules.ts`
- Test: `orchestrator/src/server/services/prefilter/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { evaluateRules } from "./rules";

const config = parsePrefilterConfig({
  title: {
    include: ["product manager", "growth"],
    exclude: ["analyst", "intern", "specialist", "court"],
  },
  companyBlocklist: ["staffing"],
  location: { commuteBlocklist: ["toronto"] },
  salary: { ratesToCad: { CAD: 1, USD: 1.37 } },
  description: {
    hardDropPhrases: ["commission-only"],
    flagPhrases: ["commission", "quota"],
  },
});

function job(overrides: Parameters<typeof createJob>[0]) {
  return createJob({
    title: "Operations Lead",
    employer: "Acme",
    location: "Waterloo, ON",
    isRemote: null,
    workFromHomeType: null,
    salary: null,
    salaryMaxAmount: null,
    salaryInterval: null,
    salaryCurrency: null,
    jobDescription: "A role.",
    ...overrides,
  });
}

describe("evaluateRules", () => {
  it.each([
    ["Business Analyst", "analyst"],
    ["Summer Intern - Marketing", "intern"],
    ["Spare Parts Specialist", "specialist"],
    ["Criminal Court Victim Specialist", "specialist"],
  ])("drops '%s' on title keyword", (title, keyword) => {
    expect(evaluateRules(job({ title }), config)).toEqual({
      decision: "drop",
      reason: `title keyword '${keyword}'`,
    });
  });

  it("does not treat 'Internal' as 'intern'", () => {
    expect(evaluateRules(job({ title: "Internal Communications Manager" }), config).decision).toBe(
      "undecided",
    );
  });

  it("keeps include hits even when an exclude also matches", () => {
    expect(evaluateRules(job({ title: "Growth Specialist" }), config)).toEqual({
      decision: "keep",
      reason: "title include 'growth'",
    });
    expect(evaluateRules(job({ title: "Senior Product Manager" }), config).decision).toBe("keep");
  });

  it("leaves unknown titles undecided for the LLM check", () => {
    expect(evaluateRules(job({ title: "Basketball Operations" }), config)).toEqual({
      decision: "undecided",
      flags: [],
    });
  });

  it("drops blocklisted companies before title rules", () => {
    expect(evaluateRules(job({ title: "Product Manager", employer: "Acme Staffing Inc" }), config)).toEqual({
      decision: "drop",
      reason: "company blocklist 'staffing'",
    });
  });

  it("drops non-remote Toronto jobs but keeps remote ones", () => {
    expect(evaluateRules(job({ location: "Toronto, ON" }), config)).toEqual({
      decision: "drop",
      reason: "location 'toronto' needs a commute (not remote)",
    });
    expect(evaluateRules(job({ location: "Toronto, ON", isRemote: true }), config).decision).toBe(
      "undecided",
    );
    expect(evaluateRules(job({ location: "Remote - Toronto, ON" }), config).decision).toBe("undecided");
  });

  it("drops on salary below the floor and never on missing salary", () => {
    const dropped = evaluateRules(job({ title: "Product Manager", salary: "$45/hr" }), config);
    expect(dropped.decision).toBe("drop");
    expect(dropped.decision === "drop" && dropped.reason).toMatch(/^salary max/);
    expect(evaluateRules(job({ title: "Product Manager" }), config).decision).toBe("keep");
  });

  it("drops hard-drop description phrases", () => {
    expect(
      evaluateRules(job({ jobDescription: "<p>This is a commission-only role.</p>" }), config),
    ).toEqual({ decision: "drop", reason: "description: 'commission-only'" });
  });

  it("passes flag phrases to the LLM instead of dropping", () => {
    expect(evaluateRules(job({ jobDescription: "Base plus commission. Quota applies." }), config)).toEqual({
      decision: "undecided",
      flags: ["commission", "quota"],
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/rules.test.ts
```
Expected: FAIL — cannot resolve `./rules`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/services/prefilter/rules.ts`:

```ts
import { stripHtmlTags } from "@shared/utils/string";
import type { PrefilterConfig } from "./config";
import { evaluateSalary } from "./salary";
import { findKeyword, findKeywords, normalizeText } from "./text-match";
import type { PrefilterJob } from "./types";

export type RuleOutcome =
  | { decision: "drop"; reason: string }
  | { decision: "keep"; reason: string }
  | { decision: "undecided"; flags: string[] };

function isRemoteJob(job: PrefilterJob): boolean {
  return (
    job.isRemote === true ||
    /remote/.test(normalizeText(job.location)) ||
    /remote/.test(normalizeText(job.workFromHomeType))
  );
}

/**
 * Order: company → commute → salary → description hard-drop → title include
 * (keep) → title exclude (drop) → undecided. Pure function, no I/O.
 */
export function evaluateRules(job: PrefilterJob, config: PrefilterConfig): RuleOutcome {
  const company = findKeyword(job.employer, config.companyBlocklist);
  if (company) return { decision: "drop", reason: `company blocklist '${company}'` };

  if (!isRemoteJob(job)) {
    const place = findKeyword(job.location, config.location.commuteBlocklist);
    if (place) {
      return { decision: "drop", reason: `location '${place}' needs a commute (not remote)` };
    }
  }

  const salary = evaluateSalary(job, config.salary);
  if (salary.belowFloor) {
    return {
      decision: "drop",
      reason: `salary max ${salary.detail} below $${Math.round(config.salary.floorAnnualCad / 1000)}K floor`,
    };
  }

  const description = stripHtmlTags(job.jobDescription ?? "");
  const hardDrop = findKeyword(description, config.description.hardDropPhrases);
  if (hardDrop) return { decision: "drop", reason: `description: '${hardDrop}'` };

  const include = findKeyword(job.title, config.title.include);
  if (include) return { decision: "keep", reason: `title include '${include}'` };

  const exclude = findKeyword(job.title, config.title.exclude);
  if (exclude) return { decision: "drop", reason: `title keyword '${exclude}'` };

  return {
    decision: "undecided",
    flags: findKeywords(description, config.description.flagPhrases),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/rules.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/services/prefilter/rules.ts orchestrator/src/server/services/prefilter/rules.test.ts
git commit -m "feat(prefilter): add rules layer"
```

---

### Task 6b: Rules-only preview

**Files:**
- Create: `orchestrator/src/server/services/prefilter/preview.ts`
- Test: `orchestrator/src/server/services/prefilter/preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "./config";
import { previewRules } from "./preview";

const config = parsePrefilterConfig({
  title: { include: ["product manager"], exclude: ["analyst"] },
  description: { flagPhrases: ["quota"] },
});

const jobs = [
  createJob({ id: "pm", title: "Product Manager", jobDescription: "" }),
  createJob({ id: "ops", title: "Operations Lead", jobDescription: "Quota applies" }),
  createJob({ id: "ba", title: "Business Analyst", jobDescription: "" }),
];

describe("previewRules", () => {
  it("counts decisions and lists drops first", () => {
    const result = previewRules(jobs, config);
    expect(result.total).toBe(3);
    expect(result.counts).toEqual({ drop: 1, keep: 1, undecided: 1 });
    expect(result.items.map((item) => [item.id, item.decision, item.detail])).toEqual([
      ["ba", "drop", "title keyword 'analyst'"],
      ["ops", "undecided", "flags: quota"],
      ["pm", "keep", "title include 'product manager'"],
    ]);
  });

  it("caps the item list but not the counts", () => {
    const result = previewRules(jobs, config, 1);
    expect(result.items).toHaveLength(1);
    expect(result.counts.drop + result.counts.keep + result.counts.undecided).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/preview.test.ts
```
Expected: FAIL — cannot resolve `./preview`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/services/prefilter/preview.ts`:

```ts
import type { PrefilterConfig } from "./config";
import { evaluateRules, type RuleOutcome } from "./rules";
import type { PrefilterJob } from "./types";

type Decision = RuleOutcome["decision"];

export type PreviewItem = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  decision: Decision;
  detail: string;
};

export type PreviewResult = {
  total: number;
  counts: Record<Decision, number>;
  items: PreviewItem[];
};

const ORDER: Record<Decision, number> = { drop: 0, undecided: 1, keep: 2 };

/** Rules layer only: no LLM, no writes. Undecided jobs would go to the AI title check. */
export function previewRules(
  jobs: PrefilterJob[],
  config: PrefilterConfig,
  limit = 1000,
): PreviewResult {
  const counts: Record<Decision, number> = { drop: 0, keep: 0, undecided: 0 };
  const items: PreviewItem[] = [];
  for (const job of jobs) {
    const outcome = evaluateRules(job, config);
    counts[outcome.decision] += 1;
    items.push({
      id: job.id,
      title: job.title,
      employer: job.employer,
      location: job.location ?? null,
      decision: outcome.decision,
      detail:
        outcome.decision === "undecided"
          ? outcome.flags.length > 0
            ? `flags: ${outcome.flags.join(", ")}`
            : "→ AI title check"
          : outcome.reason,
    });
  }
  items.sort((a, b) => ORDER[a.decision] - ORDER[b.decision]);
  return { total: jobs.length, counts, items: items.slice(0, limit) };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/preview.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/services/prefilter/preview.ts orchestrator/src/server/services/prefilter/preview.test.ts
git commit -m "feat(prefilter): add rules-only preview"
```

---

### Task 7: Batched LLM title check

**Files:**
- Create: `orchestrator/src/server/services/prefilter/llm-title-check.ts`
- Test: `orchestrator/src/server/services/prefilter/llm-title-check.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePrefilterConfig } from "./config";
import { buildTitleCheckPrompt, checkTitlesWithLlm } from "./llm-title-check";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Keep the real modelSelection (settings repo → DB) out of this unit test.
vi.mock("../modelSelection", () => ({
  createConfiguredLlmService: vi.fn(),
  resolveLlmModel: vi.fn(),
}));

const llmConfig = parsePrefilterConfig({
  llm: { enabled: true, batchSize: 2, targetRoles: "Product roles", hardPasses: "Sales" },
}).llm;

const items = [
  { job: createJob({ id: "a", title: "Basketball Operations", employer: "Raptors" }), flags: [] },
  { job: createJob({ id: "b", title: "Solutions Consultant", employer: "Acme" }), flags: ["quota"] },
  { job: createJob({ id: "c", title: "Deckhand", employer: "Ferry Co" }), flags: [] },
];

describe("checkTitlesWithLlm", () => {
  const callJson = vi.fn();
  const deps = {
    createService: async () => ({ callJson }),
    resolveModel: async () => "claude-haiku-5-5",
  };

  beforeEach(() => callJson.mockReset());

  it("batches jobs and maps short ids back to job ids", async () => {
    callJson
      .mockResolvedValueOnce({
        success: true,
        data: {
          results: [
            { id: "1", decision: "drop", reason: "Sports team operations" },
            { id: "2", decision: "maybe", reason: "Could be technical" },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { results: [{ id: "1", decision: "drop", reason: "Marine crew" }] },
      });

    const result = await checkTitlesWithLlm(items, llmConfig, deps);

    expect(callJson).toHaveBeenCalledTimes(2);
    expect(callJson.mock.calls[0][0].model).toBe("claude-haiku-5-5");
    expect(result.get("a")).toEqual({ decision: "drop", reason: "Sports team operations" });
    expect(result.get("b")).toEqual({ decision: "maybe", reason: "Could be technical" });
    expect(result.get("c")).toEqual({ decision: "drop", reason: "Marine crew" });
  });

  it("uses the config model override when set", async () => {
    callJson.mockResolvedValue({ success: true, data: { results: [] } });
    await checkTitlesWithLlm(items.slice(0, 1), { ...llmConfig, model: "custom-model" }, deps);
    expect(callJson.mock.calls[0][0].model).toBe("custom-model");
  });

  it("lets everything through when the LLM call fails", async () => {
    callJson.mockResolvedValue({ success: false, error: "boom" });
    const result = await checkTitlesWithLlm(items, llmConfig, deps);
    expect(result.size).toBe(0);
  });

  it("lets everything through when the service throws", async () => {
    const result = await checkTitlesWithLlm(items, llmConfig, {
      ...deps,
      createService: async () => {
        throw new Error("not configured");
      },
    });
    expect(result.size).toBe(0);
  });

  it("ignores unknown ids and invalid decisions", async () => {
    callJson.mockResolvedValue({
      success: true,
      data: {
        results: [
          { id: "9", decision: "drop", reason: "x" },
          { id: "1", decision: "nope", reason: "x" },
        ],
      },
    });
    const result = await checkTitlesWithLlm(items.slice(0, 1), llmConfig, deps);
    expect(result.size).toBe(0);
  });
});

describe("buildTitleCheckPrompt", () => {
  it("includes targets, hard passes, flags and a truncated excerpt", () => {
    const prompt = buildTitleCheckPrompt(
      [
        {
          job: createJob({
            title: "Solutions Consultant",
            employer: "Acme",
            location: "Remote",
            jobDescription: `<p>${"x".repeat(1000)}</p>`,
          }),
          flags: ["quota"],
        },
      ],
      { ...llmConfig, descriptionChars: 50 },
    );
    expect(prompt).toContain("Product roles");
    expect(prompt).toContain("Sales");
    expect(prompt).toContain("[1] Title: Solutions Consultant | Company: Acme | Location: Remote | Flags: quota");
    expect(prompt).toContain(`Excerpt: ${"x".repeat(50)}\n`);
    expect(prompt).not.toContain("x".repeat(51));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/llm-title-check.test.ts
```
Expected: FAIL — cannot resolve `./llm-title-check`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/services/prefilter/llm-title-check.ts`:

```ts
import { logger } from "@infra/logger";
import { stripHtmlTags } from "@shared/utils/string";
import type { LlmService } from "../llm/service";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import type { PrefilterConfig } from "./config";
import type { PrefilterJob } from "./types";

export type LlmTitleDecision = { decision: "keep" | "drop" | "maybe"; reason: string };
export type TitleCheckItem = { job: PrefilterJob; flags: string[] };

type TitleCheckDeps = {
  createService: () => Promise<Pick<LlmService, "callJson">>;
  resolveModel: () => Promise<string>;
};

const defaultDeps: TitleCheckDeps = {
  createService: () => createConfiguredLlmService("scoring"),
  resolveModel: () => resolveLlmModel("scoring"),
};

const DECISIONS = new Set(["keep", "drop", "maybe"]);

const TITLE_CHECK_SCHEMA: JsonSchemaDefinition = {
  name: "prefilter_title_check",
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The job number shown in brackets" },
            decision: { type: "string", enum: ["keep", "drop", "maybe"] },
            reason: { type: "string", description: "One short line, max 15 words" },
          },
          required: ["id", "decision", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

function excerpt(description: string | null, chars: number): string {
  if (chars <= 0) return "";
  return stripHtmlTags(description ?? "").replace(/\s+/g, " ").trim().slice(0, chars);
}

export function buildTitleCheckPrompt(
  batch: TitleCheckItem[],
  config: PrefilterConfig["llm"],
): string {
  const jobs = batch
    .map(({ job, flags }, index) => {
      const header = `[${index + 1}] Title: ${job.title} | Company: ${job.employer} | Location: ${job.location ?? "unknown"} | Flags: ${flags.length > 0 ? flags.join(", ") : "none"}`;
      return `${header}\nExcerpt: ${excerpt(job.jobDescription, config.descriptionChars)}\n`;
    })
    .join("\n");

  return `You are a fast pre-screen for a job search. For each job, decide whether it is plausibly relevant to the candidate using only the title, company, location and a short description excerpt.

Candidate is targeting:
${config.targetRoles || "(not specified)"}

Hard passes:
${config.hardPasses || "(none)"}

Rules:
- "drop" only when the job is clearly outside the target roles or clearly a hard pass (for example sports team operations, boat or marine crew, trades, court or legal services, retail, clinical roles).
- "keep" when the job clearly matches the target roles.
- "maybe" when unsure. When in doubt answer "maybe": wrongly dropping a good role is much worse than reviewing an extra one.
- Flags are phrases found in the description; treat them as hints, not proof.
- Return one result per job, using the bracketed number as id. reason is one short line (max 15 words).

Jobs:
${jobs}`;
}

/**
 * Returns decisions keyed by job id. Jobs missing from the map (LLM failure,
 * unknown id, bad output) must be treated as "pass through to full scoring".
 */
export async function checkTitlesWithLlm(
  items: TitleCheckItem[],
  config: PrefilterConfig["llm"],
  deps: TitleCheckDeps = defaultDeps,
): Promise<Map<string, LlmTitleDecision>> {
  const decisions = new Map<string, LlmTitleDecision>();
  if (items.length === 0) return decisions;

  let llm: Pick<LlmService, "callJson">;
  let model: string;
  try {
    llm = await deps.createService();
    model = config.model ?? (await deps.resolveModel());
  } catch (error) {
    logger.warn("Prefilter LLM unavailable; skipping title check", {
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
    return decisions;
  }

  for (let start = 0; start < items.length; start += config.batchSize) {
    const batch = items.slice(start, start + config.batchSize);
    const result = await llm.callJson<{
      results: Array<{ id: string; decision: string; reason: string }>;
    }>({
      model,
      messages: [{ role: "user", content: buildTitleCheckPrompt(batch, config) }],
      jsonSchema: TITLE_CHECK_SCHEMA,
      maxRetries: 1,
    });

    if (!result.success) {
      logger.warn("Prefilter title check batch failed; letting batch through", {
        batchStart: start,
        batchSize: batch.length,
        error: result.error.slice(0, 300),
      });
      continue;
    }

    for (const entry of result.data.results ?? []) {
      const index = Number.parseInt(entry.id, 10) - 1;
      const item = batch[index];
      if (!item || !DECISIONS.has(entry.decision)) continue;
      decisions.set(item.job.id, {
        decision: entry.decision as LlmTitleDecision["decision"],
        reason: String(entry.reason ?? "").trim().slice(0, 200) || "no reason given",
      });
    }
  }

  return decisions;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/services/prefilter/llm-title-check.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/services/prefilter/llm-title-check.ts orchestrator/src/server/services/prefilter/llm-title-check.test.ts
git commit -m "feat(prefilter): add batched LLM title check"
```

---

### Task 8: Pipeline step (with pause gate and fail-closed config)

**Files:**
- Create: `orchestrator/src/server/pipeline/steps/prefilter-jobs.ts`
- Test: `orchestrator/src/server/pipeline/steps/prefilter-jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefilterJobsStep } from "./prefilter-jobs";

vi.mock("@infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@server/repositories/jobs", () => ({
  getUnscoredDiscoveredJobs: vi.fn(),
}));
vi.mock("@server/repositories/prefilter", () => ({
  markJobFiltered: vi.fn(async () => true),
}));
vi.mock("@server/services/prefilter/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@server/services/prefilter/config")>();
  return { ...actual, readPrefilterConfig: vi.fn() };
});
vi.mock("@server/services/prefilter/llm-title-check", () => ({
  checkTitlesWithLlm: vi.fn(),
}));
vi.mock("../progress", () => ({ updateProgress: vi.fn() }));

type Prompt = { title: string; message: string };

describe("prefilterJobsStep", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const jobsRepo = await import("@server/repositories/jobs");
    vi.mocked(jobsRepo.getUnscoredDiscoveredJobs).mockResolvedValue([
      createJob({ id: "analyst", title: "Business Analyst", jobDescription: "" }),
      createJob({ id: "pm", title: "Product Manager", jobDescription: "" }),
      createJob({ id: "bball", title: "Basketball Operations", jobDescription: "" }),
      createJob({ id: "vague", title: "Operations Lead", jobDescription: "quota" }),
      createJob({
        id: "restored",
        title: "Business Analyst",
        filterLayer: "restored",
        jobDescription: "",
      }),
    ]);
  });

  async function useConfig(raw: unknown) {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({
      status: "ok",
      path: "/tmp/prefilter.json",
      config: configModule.parsePrefilterConfig(raw),
    });
    return configModule;
  }

  it("does nothing when the config is off (tests)", async () => {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({ status: "off-in-tests" });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.disabled).toBe(true);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
  });

  it("drops by rules, sends only undecided jobs to the LLM, skips restored jobs", async () => {
    await useConfig({
      title: { include: ["product manager"], exclude: ["analyst"] },
      description: { flagPhrases: ["quota"] },
      llm: { enabled: true },
    });
    const llm = await import("@server/services/prefilter/llm-title-check");
    vi.mocked(llm.checkTitlesWithLlm).mockResolvedValue(
      new Map([
        ["bball", { decision: "drop" as const, reason: "Sports operations" }],
        ["vague", { decision: "maybe" as const, reason: "Unclear" }],
      ]),
    );
    const prefilterRepo = await import("@server/repositories/prefilter");

    const result = await prefilterJobsStep();

    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledWith({
      id: "analyst",
      layer: "rules",
      reason: "title keyword 'analyst'",
    });
    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledWith({
      id: "bball",
      layer: "llm",
      reason: "Sports operations",
    });
    expect(prefilterRepo.markJobFiltered).toHaveBeenCalledTimes(2);

    const llmItems = vi.mocked(llm.checkTitlesWithLlm).mock.calls[0][0];
    expect(llmItems.map((item) => item.job.id)).toEqual(["bball", "vague"]);
    expect(llmItems[1].flags).toEqual(["quota"]);

    expect(result).toEqual({
      disabled: false,
      considered: 4,
      droppedByRules: 1,
      droppedByLlm: 1,
      passed: 2,
    });
  });

  it("skips the LLM when disabled in config", async () => {
    await useConfig({ title: { exclude: ["analyst"] }, llm: { enabled: false } });
    const llm = await import("@server/services/prefilter/llm-title-check");
    const result = await prefilterJobsStep();
    expect(llm.checkTitlesWithLlm).not.toHaveBeenCalled();
    expect(result.droppedByRules).toBe(1);
    expect(result.passed).toBe(3);
  });

  it("lets everything through when the filter is switched off", async () => {
    await useConfig({ enabled: false, title: { exclude: ["analyst"] } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const result = await prefilterJobsStep();
    expect(result.disabled).toBe(true);
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
  });

  it("stops early when cancelled", async () => {
    await useConfig({ title: { exclude: ["analyst"] }, llm: { enabled: true } });
    const prefilterRepo = await import("@server/repositories/prefilter");
    const llm = await import("@server/services/prefilter/llm-title-check");
    await prefilterJobsStep({ shouldCancel: () => true });
    expect(prefilterRepo.markJobFiltered).not.toHaveBeenCalled();
    expect(llm.checkTitlesWithLlm).not.toHaveBeenCalled();
  });

  it("pauses for review first, then re-reads the config", async () => {
    const configModule = await useConfig({ title: { exclude: ["analyst"] } });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ reviewGate: true, waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(waitForResume.mock.calls[0][0].title).toBe("Review filter rules before scoring");
    expect(configModule.readPrefilterConfig).toHaveBeenCalledTimes(2);
    expect(result.droppedByRules).toBe(1);
  });

  it("does not pause when pauseBeforeScoring is off", async () => {
    await useConfig({ pauseBeforeScoring: false, title: { exclude: ["analyst"] } });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    await prefilterJobsStep({ reviewGate: true, waitForResume });
    expect(waitForResume).not.toHaveBeenCalled();
  });

  it("does not pause without reviewGate (backlog button)", async () => {
    await useConfig({ title: { exclude: ["analyst"] } });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    await prefilterJobsStep({ waitForResume });
    expect(waitForResume).not.toHaveBeenCalled();
  });

  it("waits on an invalid config and continues once it is fixed", async () => {
    const configModule = await useConfig({
      pauseBeforeScoring: false,
      title: { exclude: ["analyst"] },
    });
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValueOnce({
      status: "invalid",
      path: "/tmp/prefilter.json",
      error: "title.exclude: Expected array",
    });
    const waitForResume = vi.fn(async (_prompt: Prompt) => {});
    const result = await prefilterJobsStep({ waitForResume });
    expect(waitForResume).toHaveBeenCalledTimes(1);
    expect(waitForResume.mock.calls[0][0].title).toBe("Pre-score filter needs attention");
    expect(waitForResume.mock.calls[0][0].message).toMatch(/Expected array/);
    expect(result.droppedByRules).toBe(1);
  });

  it("throws on a missing config when it cannot pause (fails closed)", async () => {
    const configModule = await import("@server/services/prefilter/config");
    vi.mocked(configModule.readPrefilterConfig).mockResolvedValue({
      status: "missing",
      path: "/tmp/prefilter.json",
    });
    await expect(prefilterJobsStep()).rejects.toThrow(/No pre-score filter config/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/pipeline/steps/prefilter-jobs.test.ts
```
Expected: FAIL — cannot resolve `./prefilter-jobs`.

- [ ] **Step 3: Implement**

`orchestrator/src/server/pipeline/steps/prefilter-jobs.ts`:

```ts
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as prefilterRepo from "@server/repositories/prefilter";
import {
  type PrefilterConfig,
  readPrefilterConfig,
} from "@server/services/prefilter/config";
import {
  checkTitlesWithLlm,
  type TitleCheckItem,
} from "@server/services/prefilter/llm-title-check";
import { evaluateRules } from "@server/services/prefilter/rules";
import { updateProgress } from "../progress";

export type PrefilterStepResult = {
  disabled: boolean;
  considered: number;
  droppedByRules: number;
  droppedByLlm: number;
  passed: number;
};

export type PrefilterPausePrompt = { title: string; message: string };

export type PrefilterStepArgs = {
  shouldCancel?: () => boolean;
  /** Pauses the run until the user clicks Resume. Without it the step never pauses. */
  waitForResume?: (prompt: PrefilterPausePrompt) => Promise<void>;
  /** Pause for review first when config.pauseBeforeScoring is on (normal runs). */
  reviewGate?: boolean;
};

const REVIEW_PROMPT: PrefilterPausePrompt = {
  title: "Review filter rules before scoring",
  message:
    "Discovery is done. Review or edit your rules in Filtered → Rules (Preview is free), then Resume to run rules → AI title check → full scoring.",
};

function emptyResult(disabled: boolean): PrefilterStepResult {
  return { disabled, considered: 0, droppedByRules: 0, droppedByLlm: 0, passed: 0 };
}

/**
 * Resolves the config to use, pausing when needed. Fails closed: a missing or
 * invalid config pauses the run (or throws when pausing is not possible) and
 * never falls through to "score everything".
 */
async function resolveConfig(args: PrefilterStepArgs): Promise<PrefilterConfig | null> {
  let reviewed = !args.reviewGate;
  while (true) {
    const load = await readPrefilterConfig();
    if (load.status === "off-in-tests") return null;

    if (load.status === "missing" || load.status === "invalid") {
      const message =
        load.status === "missing"
          ? `No pre-score filter config found at ${load.path}. Create it in Filtered → Rules, then resume.`
          : `Pre-score filter config is invalid (${load.error}). Fix it in Filtered → Rules, then resume.`;
      if (!args.waitForResume) throw new Error(message);
      await args.waitForResume({ title: "Pre-score filter needs attention", message });
      continue;
    }

    if (!reviewed && load.config.pauseBeforeScoring && args.waitForResume) {
      await args.waitForResume(REVIEW_PROMPT);
      reviewed = true;
      continue; // re-read so edits saved while paused apply to this run
    }

    return load.config;
  }
}

/**
 * Runs before scoring on every unscored discovered job (all runs, not just
 * this one). Dropped jobs become status "skipped" with an audit reason; they
 * are never deleted. Jobs the user restored are never re-filtered.
 */
export async function prefilterJobsStep(
  args: PrefilterStepArgs = {},
): Promise<PrefilterStepResult> {
  const config = await resolveConfig(args);
  if (!config) {
    logger.info("Prefilter not configured in this environment; skipping");
    return emptyResult(true);
  }
  if (!config.enabled) {
    logger.info("Prefilter switched off in config; all jobs go to scoring");
    return emptyResult(true);
  }
  if (args.shouldCancel?.()) return emptyResult(false);

  const candidates = (await jobsRepo.getUnscoredDiscoveredJobs()).filter(
    (job) => job.filterLayer !== "restored",
  );
  updateProgress({
    step: "scoring",
    message: `Pre-filtering ${candidates.length} jobs before scoring`,
  });

  let droppedByRules = 0;
  let droppedByLlm = 0;
  const undecided: TitleCheckItem[] = [];

  for (const job of candidates) {
    if (args.shouldCancel?.()) break;
    const outcome = evaluateRules(job, config);
    if (outcome.decision === "drop") {
      if (
        await prefilterRepo.markJobFiltered({
          id: job.id,
          layer: "rules",
          reason: outcome.reason,
        })
      ) {
        droppedByRules += 1;
      }
    } else if (outcome.decision === "undecided") {
      undecided.push({ job, flags: outcome.flags });
    }
  }

  if (config.llm.enabled && undecided.length > 0 && !args.shouldCancel?.()) {
    updateProgress({
      step: "scoring",
      message: `Checking ${undecided.length} job titles with the AI pre-screen`,
    });
    const decisions = await checkTitlesWithLlm(undecided, config.llm);
    for (const { job } of undecided) {
      const decision = decisions.get(job.id);
      if (decision?.decision !== "drop") continue;
      if (
        await prefilterRepo.markJobFiltered({
          id: job.id,
          layer: "llm",
          reason: decision.reason,
        })
      ) {
        droppedByLlm += 1;
      }
    }
  }

  const result: PrefilterStepResult = {
    disabled: false,
    considered: candidates.length,
    droppedByRules,
    droppedByLlm,
    passed: candidates.length - droppedByRules - droppedByLlm,
  };
  logger.info("Prefilter step completed", result);
  return result;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/server/pipeline/steps/prefilter-jobs.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/pipeline/steps/prefilter-jobs.ts orchestrator/src/server/pipeline/steps/prefilter-jobs.test.ts
git commit -m "feat(prefilter): add pipeline step with review pause and fail-closed config"
```

---

### Task 9: Pause card labels

**Files:**
- Modify: `shared/src/types/pipeline.ts` (`interface PipelineProgressState`, after `detail?: string;`)
- Modify: `orchestrator/src/client/components/PipelineProgressCard.tsx` (the `PipelineActionRequired` block for `configuration_required`, ~line 296)

- [ ] **Step 1: Add the optional fields**

```ts
  /** Optional overrides for the configuration_required pause card. */
  actionTitle?: string;
  actionLabel?: string;
```

- [ ] **Step 2: Use them in the card**

Replace:

```tsx
                title="LLM configuration required"
                description={progress.error}
                actionLabel="Restart scoring"
```

with:

```tsx
                title={progress.actionTitle ?? "LLM configuration required"}
                description={progress.error}
                actionLabel={progress.actionLabel ?? "Restart scoring"}
```

The existing LLM-not-configured pause never sets these fields, so it looks exactly as before.

- [ ] **Step 3: Type-check and run the card's tests**

```bash
npm run check:types:shared && npm --workspace orchestrator run check:types
npm --workspace orchestrator run test:run -- src/client/components
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add shared/src/types/pipeline.ts orchestrator/src/client/components/PipelineProgressCard.tsx
git commit -m "feat(prefilter): let pause card show a custom title and button"
```

---

### Task 10: Wire the step into the pipeline (gate + backlog-only mode)

**Files:**
- Modify: `orchestrator/src/server/pipeline/orchestrator.ts`
- Test: `orchestrator/src/server/pipeline/prefilter-gate.test.ts`

- [ ] **Step 1: Write the failing integration test**

`orchestrator/src/server/pipeline/prefilter-gate.test.ts` (same harness as `llm-configuration.test.ts`; the real prefilter step runs against a temp DB and a temp config file):

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-prefilter-gate-1",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
  })),
  updatePipelineRun: vi.fn(async () => undefined),
}));

const discoverJobsStep = vi.fn(async () => ({
  discoveredJobs: [],
  sourceErrors: [],
  pendingChallenges: [],
}));
const scoreJobsStep = vi.fn(async () => ({ unprocessedJobs: [], scoredJobs: [] }));
const selectJobsStep = vi.fn(() => []);

vi.mock("./steps", () => ({
  loadProfileStep: vi.fn(async () => ({})),
  discoverJobsStep,
  importJobsStep: vi.fn(async () => ({ created: 0, skipped: 0, fuzzyMerged: 0 })),
  scoreJobsStep,
  selectJobsStep,
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

describe.sequential("pipeline prefilter gate", () => {
  let tempDir: string;
  const originalConfigPath = process.env.PREFILTER_CONFIG_PATH;

  async function writeConfig(raw: unknown | string) {
    const file = join(tempDir, "prefilter.json");
    await writeFile(file, typeof raw === "string" ? raw : JSON.stringify(raw));
    process.env.PREFILTER_CONFIG_PATH = file;
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-prefilter-gate-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    await import("../db/migrate");
  });

  afterEach(async () => {
    if (originalConfigPath === undefined) delete process.env.PREFILTER_CONFIG_PATH;
    else process.env.PREFILTER_CONFIG_PATH = originalConfigPath;
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("pauses before scoring until resumed", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(getProgress().actionTitle).toBe("Review filter rules before scoring");
    expect(scoreJobsStep).not.toHaveBeenCalled();

    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });
    const result = await runPromise;
    expect(result.success).toBe(true);
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
    expect(getProgress().actionTitle).toBeUndefined();
  });

  it("pauses on an invalid config instead of scoring everything", async () => {
    await writeConfig("{ broken");
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().actionTitle).toBe("Pre-score filter needs attention");
    });
    expect(scoreJobsStep).not.toHaveBeenCalled();

    await writeConfig({ pauseBeforeScoring: false });
    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });
    expect((await runPromise).success).toBe(true);
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled while paused", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(pipeline.requestPipelineCancel().accepted).toBe(true);
    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(scoreJobsStep).not.toHaveBeenCalled();
  });

  it("backlog mode skips discovery, the pause and tailoring", async () => {
    await writeConfig({ pauseBeforeScoring: true });
    const pipeline = await import("./orchestrator");

    const result = await pipeline.runPipeline(
      { enableCrawling: false, enableImporting: false, enableAutoTailoring: false },
      { skipPrefilterReview: true },
    );

    expect(result.success).toBe(true);
    expect(discoverJobsStep).not.toHaveBeenCalled();
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
    expect(selectJobsStep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/server/pipeline/prefilter-gate.test.ts
```
Expected: FAIL — the run never pauses (step not wired yet) and `discoverJobsStep` is called in backlog mode.

- [ ] **Step 3: Imports**

Add `updateProgress` to the existing `./progress` import:

```ts
import {
  type PendingChallenge,
  progressHelpers,
  resetProgress,
  updateProgress,
} from "./progress";
```

Below the `} from "./steps";` block (imported directly, not through `./steps`, so tests that mock `./steps` still get the real step, which is a no-op under `NODE_ENV=test` without `PREFILTER_CONFIG_PATH`):

```ts
import { prefilterJobsStep } from "./steps/prefilter-jobs";
```

- [ ] **Step 4: New run option**

Change the `runPipeline` signature's options type from:

```ts
  options?: { hostedUsageReservationId?: string | null },
```

to:

```ts
  options?: {
    hostedUsageReservationId?: string | null;
    /** Backlog button: the click is the go-ahead, so don't pause for review. */
    skipPrefilterReview?: boolean;
  },
```

- [ ] **Step 5: Skip discovery when `enableCrawling === false`**

Replace:

```ts
      let { discoveredJobs, sourceErrors, pendingChallenges } =
        await discoverJobsStep({
          mergedConfig,
          watchlistSelectedSourceIds: mergedConfig.watchlistSelectedSourceIds,
          shouldCancel: () =>
            getPipelineState(scopeKey).cancelRequestedAt !== null,
        });
```

with:

```ts
      let { discoveredJobs, sourceErrors, pendingChallenges } =
        mergedConfig.enableCrawling === false
          ? {
              discoveredJobs: [] as CreateJobInput[],
              sourceErrors: [] as string[],
              pendingChallenges: [] as PendingChallenge[],
            }
          : await discoverJobsStep({
              mergedConfig,
              watchlistSelectedSourceIds:
                mergedConfig.watchlistSelectedSourceIds,
              shouldCancel: () =>
                getPipelineState(scopeKey).cancelRequestedAt !== null,
            });
```

(The challenge loop and import then run on an empty list, which is a no-op.)

- [ ] **Step 6: Call the prefilter step before scoring**

Replace:

```ts
      let scoredJobs: import("./steps/types").ScoredJob[] = [];

      ensureNotCancelled(scopeKey);
      await persistResultSummary({ stage: "scoring" });
```

with:

```ts
      ensureNotCancelled(scopeKey);
      const prefilterResult = await prefilterJobsStep({
        reviewGate: !options?.skipPrefilterReview,
        shouldCancel: () =>
          getPipelineState(scopeKey).cancelRequestedAt !== null,
        // Reuses the LLM-config pause: same card, same Resume endpoint, and
        // requestPipelineCancel() already unblocks it.
        waitForResume: async ({ title, message }) => {
          pipelineLogger.info("Pipeline paused before scoring", { title });
          updateProgress({
            step: "configuration_required",
            message: title,
            detail: message,
            error: message,
            actionTitle: title,
            actionLabel: "Resume: rules → AI check → scoring",
          });
          await new Promise<void>((resolve) => {
            tenantState.activeLlmConfigState = { resolve };
          });
          tenantState.activeLlmConfigState = null;
          updateProgress({
            actionTitle: undefined,
            actionLabel: undefined,
            error: undefined,
            detail: undefined,
          });
          ensureNotCancelled(scopeKey);
        },
      });
      pipelineLogger.info("Prefilter finished", prefilterResult);

      let scoredJobs: import("./steps/types").ScoredJob[] = [];

      ensureNotCancelled(scopeKey);
      await persistResultSummary({ stage: "scoring" });
```

- [ ] **Step 7: Skip selection/tailoring when `enableAutoTailoring === false`**

Replace:

```ts
      const jobsToProcess = await selectJobsStep({
        scoredJobs,
        mergedConfig,
      });
```

with:

```ts
      const jobsToProcess =
        mergedConfig.enableAutoTailoring === false
          ? []
          : await selectJobsStep({
              scoredJobs,
              mergedConfig,
            });
```

- [ ] **Step 8: Run the new test and all pipeline tests**

```bash
npm --workspace orchestrator run test:run -- src/server/pipeline
```
Expected: PASS, including the 4 new gate tests and every existing pipeline test.

- [ ] **Step 9: Commit**

```bash
git add orchestrator/src/server/pipeline/orchestrator.ts orchestrator/src/server/pipeline/prefilter-gate.test.ts
git commit -m "feat(prefilter): run prefilter before scoring with review pause and backlog-only mode"
```

---

### Task 11: API routes

**Files:**
- Create: `orchestrator/src/server/api/routes/prefilter.ts`
- Modify: `orchestrator/src/server/api/routes.ts` (import near line 16, `apiRouter.use` near line 35)

Endpoints (all under `/api/prefilter`):

| Method | Path | Does |
|---|---|---|
| GET | `/jobs` | List filtered jobs |
| POST | `/jobs/:id/restore` | Restore one (404 if not filtered) |
| GET | `/config` | `{ status, path, config, error, defaults }` |
| PUT | `/config` | Body `{ config }`; validate + write file; 400 with field errors |
| POST | `/preview` | Body `{ config }` (unsaved draft OK); rules-only result on the unscored backlog |
| POST | `/score-backlog` | 409 if a run is active; 400 if config missing/invalid; else starts a backlog-only run |

- [ ] **Step 1: Implement the router**

```ts
import { badRequest, conflict, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { getPipelineStatus, runPipeline } from "@server/pipeline/orchestrator";
import * as jobsRepo from "@server/repositories/jobs";
import * as prefilterRepo from "@server/repositories/prefilter";
import {
  formatConfigError,
  parsePrefilterConfig,
  readPrefilterConfig,
  writePrefilterConfig,
} from "@server/services/prefilter/config";
import { previewRules } from "@server/services/prefilter/preview";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const prefilterRouter = Router();

function handle(
  route: string,
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      const err =
        error instanceof z.ZodError
          ? badRequest(formatConfigError(error))
          : toAppError(error);
      logger[err.status >= 500 ? "error" : "warn"]("Prefilter route failed", {
        route,
        requestId: String(res.getHeader("x-request-id") || "unknown"),
        status: err.status,
        code: err.code,
      });
      fail(res, err);
    }
  };
}

prefilterRouter.get(
  "/jobs",
  handle("GET /api/prefilter/jobs", async (_req, res) => {
    ok(res, { jobs: await prefilterRepo.listFilteredJobs() });
  }),
);

prefilterRouter.post(
  "/jobs/:id/restore",
  handle("POST /api/prefilter/jobs/:id/restore", async (req, res) => {
    if (!(await prefilterRepo.restoreFilteredJob(req.params.id))) {
      throw notFound("Filtered job not found");
    }
    logger.info("Prefiltered job restored", { jobId: req.params.id });
    ok(res, { id: req.params.id, restored: true });
  }),
);

prefilterRouter.get(
  "/config",
  handle("GET /api/prefilter/config", async (_req, res) => {
    const load = await readPrefilterConfig();
    ok(res, {
      status: load.status,
      path: "path" in load ? load.path : null,
      config: load.status === "ok" ? load.config : null,
      error: load.status === "invalid" ? load.error : null,
      defaults: parsePrefilterConfig({}),
    });
  }),
);

prefilterRouter.put(
  "/config",
  handle("PUT /api/prefilter/config", async (req, res) => {
    const saved = await writePrefilterConfig(req.body?.config);
    logger.info("Prefilter config saved", { path: saved.path });
    ok(res, saved);
  }),
);

prefilterRouter.post(
  "/preview",
  handle("POST /api/prefilter/preview", async (req, res) => {
    const config = parsePrefilterConfig(req.body?.config);
    const jobs = (await jobsRepo.getUnscoredDiscoveredJobs()).filter(
      (job) => job.filterLayer !== "restored",
    );
    ok(res, previewRules(jobs, config));
  }),
);

prefilterRouter.post(
  "/score-backlog",
  handle("POST /api/prefilter/score-backlog", async (_req, res) => {
    if (getPipelineStatus().isRunning) {
      throw conflict("Pipeline is already running");
    }
    const load = await readPrefilterConfig();
    if (load.status === "missing") {
      throw badRequest("No filter rules saved yet. Save your rules first.");
    }
    if (load.status === "invalid") {
      throw badRequest(`Filter rules are invalid: ${load.error}`);
    }
    runWithRequestContext({}, () => {
      runPipeline(
        { enableCrawling: false, enableImporting: false, enableAutoTailoring: false },
        { skipPrefilterReview: true },
      ).catch((error) => {
        logger.error("Backlog scoring run failed", {
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
      });
    });
    ok(res, { started: true });
  }),
);
```

- [ ] **Step 2: Mount it** in `orchestrator/src/server/api/routes.ts`:

```ts
import { prefilterRouter } from "./routes/prefilter";
// ...next to apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/prefilter", prefilterRouter);
```

- [ ] **Step 3: Type-check**

```bash
npm --workspace orchestrator run check:types
```
Expected: no errors.

- [ ] **Step 4: Smoke-test against a data copy** (server only, real requests)

```bash
rm -rf /tmp/jobops-api && cp -R /Users/owenbrown/Documents/Claude/job-ops/data /tmp/jobops-api
cp /Users/owenbrown/Documents/Claude/job-ops/config/prefilter.json /tmp/jobops-api/prefilter.json
cd /Users/owenbrown/Documents/Claude/job-ops/orchestrator
DATA_DIR=/tmp/jobops-api npx tsx src/server/db/migrate.ts
DATA_DIR=/tmp/jobops-api PREFILTER_CONFIG_PATH=/tmp/jobops-api/prefilter.json npm run dev:server
```
In a second terminal (add an auth header if your instance requires sign-in):
```bash
curl -s localhost:3001/api/prefilter/config | head -c 400
curl -s -X POST localhost:3001/api/prefilter/preview -H 'Content-Type: application/json' -d "{\"config\": $(cat /tmp/jobops-api/prefilter.json)}" | head -c 600
curl -s -X PUT localhost:3001/api/prefilter/config -H 'Content-Type: application/json' -d '{"config":{"enabled":"yes"}}'
```
Expected: config `status: "ok"`; preview returns counts for the ~464 unscored jobs; the bad PUT returns `400 INVALID_REQUEST` naming `enabled`, and the file is unchanged. Do **not** call `score-backlog` here (it spends LLM credits); that is covered in Task 15.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/api/routes/prefilter.ts orchestrator/src/server/api/routes.ts
git commit -m "feat(prefilter): add API for filtered jobs, rules config, preview and backlog run"
```

---

### Task 12: Client API and form helpers

**Files:**
- Create: `orchestrator/src/client/api/prefilter.ts`
- Modify: `orchestrator/src/client/api/client.ts`
- Create: `orchestrator/src/client/pages/filtered/prefilter-form.ts`
- Test: `orchestrator/src/client/pages/filtered/prefilter-form.test.ts`

- [ ] **Step 1: Client API**

`orchestrator/src/client/api/prefilter.ts`:

```ts
import type { PrefilterLayer } from "@shared/types.js";
import { fetchApi } from "./core";

export type FilteredJob = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  salary: string | null;
  jobUrl: string;
  filterReason: string | null;
  filterLayer: PrefilterLayer | null;
  filteredAt: string | null;
  discoveredAt: string;
};

/** Mirrors the server Zod schema in services/prefilter/config.ts. */
export type PrefilterConfigDto = {
  _comment?: string;
  enabled: boolean;
  pauseBeforeScoring: boolean;
  title: { _comment?: string; include: string[]; exclude: string[] };
  companyBlocklist: string[];
  location: { _comment?: string; commuteBlocklist: string[] };
  salary: {
    _comment?: string;
    enabled: boolean;
    floorAnnualCad: number;
    hoursPerYear: number;
    defaultCurrency: string;
    ratesToCad: Record<string, number>;
  };
  description: { _comment?: string; hardDropPhrases: string[]; flagPhrases: string[] };
  llm: {
    _comment?: string;
    enabled: boolean;
    batchSize: number;
    descriptionChars: number;
    model: string | null;
    targetRoles: string;
    hardPasses: string;
  };
};

export type PrefilterConfigResponse = {
  status: "ok" | "missing" | "invalid" | "off-in-tests";
  path: string | null;
  config: PrefilterConfigDto | null;
  error: string | null;
  defaults: PrefilterConfigDto;
};

export type PrefilterPreview = {
  total: number;
  counts: { drop: number; keep: number; undecided: number };
  items: Array<{
    id: string;
    title: string;
    employer: string;
    location: string | null;
    decision: "drop" | "keep" | "undecided";
    detail: string;
  }>;
};

export async function getFilteredJobs(): Promise<{ jobs: FilteredJob[] }> {
  return fetchApi<{ jobs: FilteredJob[] }>("/prefilter/jobs");
}

export async function restoreFilteredJob(
  id: string,
): Promise<{ id: string; restored: boolean }> {
  return fetchApi<{ id: string; restored: boolean }>(
    `/prefilter/jobs/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export async function getPrefilterConfig(): Promise<PrefilterConfigResponse> {
  return fetchApi<PrefilterConfigResponse>("/prefilter/config");
}

export async function savePrefilterConfig(
  config: PrefilterConfigDto,
): Promise<{ config: PrefilterConfigDto; path: string }> {
  return fetchApi<{ config: PrefilterConfigDto; path: string }>("/prefilter/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export async function previewPrefilter(
  config: PrefilterConfigDto,
): Promise<PrefilterPreview> {
  return fetchApi<PrefilterPreview>("/prefilter/preview", {
    method: "POST",
    body: JSON.stringify({ config }),
  });
}

export async function scoreBacklog(): Promise<{ started: boolean }> {
  return fetchApi<{ started: boolean }>("/prefilter/score-backlog", {
    method: "POST",
  });
}
```

Add to `orchestrator/src/client/api/client.ts`:

```ts
export * from "./prefilter";
```

(`fetchApi` adds `Content-Type: application/json`, the same way `updateJob` in `api/jobs.ts` relies on it.)

- [ ] **Step 2: Write the failing form-helper test**

`orchestrator/src/client/pages/filtered/prefilter-form.test.ts`:

```ts
import type { PrefilterConfigDto } from "@client/api";
import { describe, expect, it } from "vitest";
import {
  configToForm,
  formToConfig,
  fromLines,
  ratesFromText,
} from "./prefilter-form";

const base: PrefilterConfigDto = {
  _comment: "top",
  enabled: true,
  pauseBeforeScoring: true,
  title: { _comment: "t", include: ["growth"], exclude: ["analyst", "intern"] },
  companyBlocklist: [],
  location: { commuteBlocklist: ["toronto"] },
  salary: {
    enabled: true,
    floorAnnualCad: 110000,
    hoursPerYear: 2080,
    defaultCurrency: "CAD",
    ratesToCad: { CAD: 1, USD: 1.37 },
  },
  description: { hardDropPhrases: ["commission only"], flagPhrases: ["quota"] },
  llm: {
    enabled: true,
    batchSize: 20,
    descriptionChars: 400,
    model: null,
    targetRoles: "PM roles",
    hardPasses: "Sales",
  },
};

describe("prefilter form helpers", () => {
  it("round-trips a config unchanged", () => {
    expect(formToConfig(configToForm(base), base)).toEqual(base);
  });

  it("splits one keyword per line, trimming blanks", () => {
    expect(fromLines(" analyst \n\n intern\n")).toEqual(["analyst", "intern"]);
  });

  it("parses currency rates", () => {
    expect(ratesFromText("cad=1\nUSD = 1.37\n")).toEqual({ CAD: 1, USD: 1.37 });
  });

  it("applies edits and keeps comments", () => {
    const form = {
      ...configToForm(base),
      titleExclude: "analyst\nsales",
      floorAnnualCad: "120000",
      model: "  ",
      pauseBeforeScoring: false,
    };
    const next = formToConfig(form, base);
    expect(next.title.exclude).toEqual(["analyst", "sales"]);
    expect(next.title._comment).toBe("t");
    expect(next._comment).toBe("top");
    expect(next.salary.floorAnnualCad).toBe(120000);
    expect(next.llm.model).toBeNull();
    expect(next.pauseBeforeScoring).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
npm --workspace orchestrator run test:run -- src/client/pages/filtered/prefilter-form.test.ts
```
Expected: FAIL — cannot resolve `./prefilter-form`.

- [ ] **Step 4: Implement**

`orchestrator/src/client/pages/filtered/prefilter-form.ts`:

```ts
import type { PrefilterConfigDto } from "@client/api";

/** Text-friendly form state: lists are one item per line, numbers are strings. */
export type PrefilterFormState = {
  enabled: boolean;
  pauseBeforeScoring: boolean;
  titleInclude: string;
  titleExclude: string;
  companyBlocklist: string;
  commuteBlocklist: string;
  hardDropPhrases: string;
  flagPhrases: string;
  salaryEnabled: boolean;
  floorAnnualCad: string;
  hoursPerYear: string;
  defaultCurrency: string;
  ratesToCad: string;
  llmEnabled: boolean;
  batchSize: string;
  descriptionChars: string;
  model: string;
  targetRoles: string;
  hardPasses: string;
};

export function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function ratesFromText(value: string): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const line of fromLines(value)) {
    const [code, rate] = line.split("=").map((part) => part.trim());
    if (code) rates[code.toUpperCase()] = Number(rate);
  }
  return rates;
}

function ratesToText(rates: Record<string, number>): string {
  return Object.entries(rates)
    .map(([code, rate]) => `${code}=${rate}`)
    .join("\n");
}

export function configToForm(config: PrefilterConfigDto): PrefilterFormState {
  return {
    enabled: config.enabled,
    pauseBeforeScoring: config.pauseBeforeScoring,
    titleInclude: config.title.include.join("\n"),
    titleExclude: config.title.exclude.join("\n"),
    companyBlocklist: config.companyBlocklist.join("\n"),
    commuteBlocklist: config.location.commuteBlocklist.join("\n"),
    hardDropPhrases: config.description.hardDropPhrases.join("\n"),
    flagPhrases: config.description.flagPhrases.join("\n"),
    salaryEnabled: config.salary.enabled,
    floorAnnualCad: String(config.salary.floorAnnualCad),
    hoursPerYear: String(config.salary.hoursPerYear),
    defaultCurrency: config.salary.defaultCurrency,
    ratesToCad: ratesToText(config.salary.ratesToCad),
    llmEnabled: config.llm.enabled,
    batchSize: String(config.llm.batchSize),
    descriptionChars: String(config.llm.descriptionChars),
    model: config.llm.model ?? "",
    targetRoles: config.llm.targetRoles,
    hardPasses: config.llm.hardPasses,
  };
}

/** Applies the form onto `base`, keeping fields the form doesn't show (e.g. _comment). */
export function formToConfig(
  form: PrefilterFormState,
  base: PrefilterConfigDto,
): PrefilterConfigDto {
  return {
    ...base,
    enabled: form.enabled,
    pauseBeforeScoring: form.pauseBeforeScoring,
    title: {
      ...base.title,
      include: fromLines(form.titleInclude),
      exclude: fromLines(form.titleExclude),
    },
    companyBlocklist: fromLines(form.companyBlocklist),
    location: { ...base.location, commuteBlocklist: fromLines(form.commuteBlocklist) },
    salary: {
      ...base.salary,
      enabled: form.salaryEnabled,
      floorAnnualCad: Number(form.floorAnnualCad),
      hoursPerYear: Number(form.hoursPerYear),
      defaultCurrency: form.defaultCurrency.trim().toUpperCase(),
      ratesToCad: ratesFromText(form.ratesToCad),
    },
    description: {
      ...base.description,
      hardDropPhrases: fromLines(form.hardDropPhrases),
      flagPhrases: fromLines(form.flagPhrases),
    },
    llm: {
      ...base.llm,
      enabled: form.llmEnabled,
      batchSize: Number(form.batchSize),
      descriptionChars: Number(form.descriptionChars),
      model: form.model.trim() || null,
      targetRoles: form.targetRoles.trim(),
      hardPasses: form.hardPasses.trim(),
    },
  };
}
```

(Bad numbers become `NaN`; the server rejects them with a field-level message on Save or Preview.)

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm --workspace orchestrator run test:run -- src/client/pages/filtered/prefilter-form.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/client/api/prefilter.ts orchestrator/src/client/api/client.ts orchestrator/src/client/pages/filtered/prefilter-form.ts orchestrator/src/client/pages/filtered/prefilter-form.test.ts
git commit -m "feat(prefilter): add client API and rules form helpers"
```

---

### Task 13: Filtered page (jobs tab, Rules tab, backlog button)

**Files:**
- Create: `orchestrator/src/client/pages/filtered/PrefilterRulesEditor.tsx`
- Create: `orchestrator/src/client/pages/FilteredJobsPage.tsx`
- Modify: `orchestrator/src/client/App.tsx`, `orchestrator/src/client/components/navigation.ts`

- [ ] **Step 1: Rules editor**

`orchestrator/src/client/pages/filtered/PrefilterRulesEditor.tsx`:

```tsx
import * as api from "@client/api";
import type { PrefilterConfigDto, PrefilterPreview } from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  configToForm,
  formToConfig,
  type PrefilterFormState,
} from "./prefilter-form";

export const PREFILTER_CONFIG_KEY = ["prefilter", "config"] as const;

const DECISION_CLASS: Record<PrefilterPreview["items"][number]["decision"], string> = {
  drop: "text-rose-400",
  undecided: "text-amber-300",
  keep: "text-emerald-400",
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-4 rounded-md border border-border p-4">
    <h2 className="text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

const TextField: React.FC<{
  id: string;
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}> = ({ id, label, hint, value, rows = 6, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const NumberField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const ToggleField: React.FC<{
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ id, label, hint, checked, onChange }) => (
  <div className="flex items-start gap-3">
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
    <div className="space-y-0.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  </div>
);

export const PrefilterRulesEditor: React.FC = () => {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: PREFILTER_CONFIG_KEY,
    queryFn: api.getPrefilterConfig,
  });
  const base: PrefilterConfigDto | null = configQuery.data
    ? (configQuery.data.config ?? configQuery.data.defaults)
    : null;
  const [form, setForm] = useState<PrefilterFormState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrefilterPreview | null>(null);

  useEffect(() => {
    if (base && form === null) setForm(configToForm(base));
  }, [base, form]);

  const save = useMutation({
    mutationFn: (config: PrefilterConfigDto) => api.savePrefilterConfig(config),
    onSuccess: (saved) => {
      setNotice(`Saved to ${saved.path}`);
      setForm(configToForm(saved.config));
      void queryClient.invalidateQueries({ queryKey: PREFILTER_CONFIG_KEY });
    },
    onError: (err) => showErrorToast(err, "Rules not saved"),
  });
  const runPreview = useMutation({
    mutationFn: (config: PrefilterConfigDto) => api.previewPrefilter(config),
    onSuccess: setPreview,
    onError: (err) => showErrorToast(err, "Preview failed"),
  });
  const resume = useMutation({
    mutationFn: api.resumePipelineScoring,
    onSuccess: () => setNotice("Resumed: rules → AI title check → scoring are running."),
    onError: (err) => showErrorToast(err, "No paused run to resume"),
  });

  if (configQuery.isLoading || !form || !base) {
    return <p className="text-sm text-muted-foreground">Loading rules…</p>;
  }

  const status = configQuery.data?.status;
  const update = <K extends keyof PrefilterFormState>(
    key: K,
    value: PrefilterFormState[K],
  ) => {
    setNotice(null);
    setForm({ ...form, [key]: value });
  };
  const draft = () => formToConfig(form, base);

  return (
    <div className="space-y-6">
      {status === "missing" ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          No rules file yet. These are defaults; Save creates {configQuery.data?.path}.
        </p>
      ) : null}
      {status === "invalid" ? (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          The rules file is invalid ({configQuery.data?.error}). Showing defaults; Save overwrites it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate(draft())} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save rules"}
        </Button>
        <Button variant="outline" onClick={() => runPreview.mutate(draft())} disabled={runPreview.isPending}>
          {runPreview.isPending ? "Previewing…" : "Preview (rules only, free)"}
        </Button>
        <Button variant="outline" onClick={() => resume.mutate()} disabled={resume.isPending}>
          Resume paused run
        </Button>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {preview ? (
        <Section title={`Preview on ${preview.total} unscored jobs`}>
          <p className="text-sm">
            {preview.counts.drop} dropped by rules · {preview.counts.undecided} go to the AI
            title check · {preview.counts.keep} go straight to full scoring
          </p>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {preview.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
                <span className={`w-24 shrink-0 text-xs uppercase ${DECISION_CLASS[item.decision]}`}>
                  {item.decision}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {item.title} · {item.employer}
                </span>
                <span className="text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="General">
        <ToggleField
          id="pf-enabled"
          label="Filter enabled"
          hint="Off = every job goes straight to full scoring."
          checked={form.enabled}
          onChange={(v) => update("enabled", v)}
        />
        <ToggleField
          id="pf-pause"
          label="Pause before scoring each run"
          hint="Runs stop after discovery and wait for Resume. Turn off once you trust the rules."
          checked={form.pauseBeforeScoring}
          onChange={(v) => update("pauseBeforeScoring", v)}
        />
      </Section>

      <Section title="Job title">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-include"
            label="Always keep (include)"
            hint="One per line. Overrides excludes and skips the AI check."
            value={form.titleInclude}
            rows={10}
            onChange={(v) => update("titleInclude", v)}
          />
          <TextField
            id="pf-exclude"
            label="Drop (exclude)"
            hint="One per line. Whole words; a trailing 's' also matches."
            value={form.titleExclude}
            rows={10}
            onChange={(v) => update("titleExclude", v)}
          />
        </div>
      </Section>

      <Section title="Company and location">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-company"
            label="Company blocklist"
            value={form.companyBlocklist}
            onChange={(v) => update("companyBlocklist", v)}
          />
          <TextField
            id="pf-commute"
            label="Commute locations to drop"
            hint="Dropped only when the job is not remote."
            value={form.commuteBlocklist}
            onChange={(v) => update("commuteBlocklist", v)}
          />
        </div>
      </Section>

      <Section title="Salary">
        <ToggleField
          id="pf-salary"
          label="Salary floor check"
          hint="Drops only when a listed maximum converts below the floor. Missing salary never drops."
          checked={form.salaryEnabled}
          onChange={(v) => update("salaryEnabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="pf-floor" label="Floor (CAD / year)" value={form.floorAnnualCad} onChange={(v) => update("floorAnnualCad", v)} />
          <NumberField id="pf-hours" label="Hours per year (hourly → annual)" value={form.hoursPerYear} onChange={(v) => update("hoursPerYear", v)} />
          <div className="space-y-1.5">
            <Label htmlFor="pf-currency">Default currency</Label>
            <Input id="pf-currency" value={form.defaultCurrency} onChange={(e) => update("defaultCurrency", e.target.value)} />
          </div>
        </div>
        <TextField
          id="pf-rates"
          label="Rates to CAD"
          hint="One per line, e.g. USD=1.37"
          value={form.ratesToCad}
          rows={4}
          onChange={(v) => update("ratesToCad", v)}
        />
      </Section>

      <Section title="Description">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-harddrop"
            label="Drop when description contains"
            value={form.hardDropPhrases}
            onChange={(v) => update("hardDropPhrases", v)}
          />
          <TextField
            id="pf-flags"
            label="Flag for the AI check (never drops alone)"
            value={form.flagPhrases}
            onChange={(v) => update("flagPhrases", v)}
          />
        </div>
      </Section>

      <Section title="AI title check">
        <ToggleField
          id="pf-llm"
          label="Run the AI title check"
          hint="Batched, cheap. Only 'drop' filters a job; 'keep' and 'maybe' go to full scoring."
          checked={form.llmEnabled}
          onChange={(v) => update("llmEnabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="pf-batch" label="Jobs per call" value={form.batchSize} onChange={(v) => update("batchSize", v)} />
          <NumberField id="pf-chars" label="Description characters" value={form.descriptionChars} onChange={(v) => update("descriptionChars", v)} />
          <div className="space-y-1.5">
            <Label htmlFor="pf-model">Model (blank = scoring model)</Label>
            <Input id="pf-model" value={form.model} onChange={(e) => update("model", e.target.value)} />
          </div>
        </div>
        <TextField
          id="pf-targets"
          label="Roles I'm targeting"
          value={form.targetRoles}
          rows={5}
          onChange={(v) => update("targetRoles", v)}
        />
        <TextField
          id="pf-hardpasses"
          label="Hard passes"
          value={form.hardPasses}
          rows={4}
          onChange={(v) => update("hardPasses", v)}
        />
      </Section>
    </div>
  );
};
```

- [ ] **Step 2: Page with tabs and the backlog button**

`orchestrator/src/client/pages/FilteredJobsPage.tsx`:

```tsx
import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrefilterRulesEditor } from "./filtered/PrefilterRulesEditor";

const FILTERED_JOBS_KEY = ["prefilter", "filtered-jobs"] as const;

export const FilteredJobsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: FILTERED_JOBS_KEY,
    queryFn: api.getFilteredJobs,
  });
  const [confirmBacklog, setConfirmBacklog] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: (id: string) => api.restoreFilteredJob(id),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (err) => showErrorToast(err, "Failed to restore job"),
  });
  const backlog = useMutation({
    mutationFn: api.scoreBacklog,
    onSuccess: () => {
      setConfirmBacklog(false);
      setNotice("Started: rules → AI title check → full scoring. Progress shows on the Jobs page.");
    },
    onError: (err) => {
      setConfirmBacklog(false);
      showErrorToast(err, "Could not start the backlog run");
    },
  });
  const jobs = data?.jobs ?? [];

  return (
    <>
      <PageHeader
        icon={Filter}
        title="Filtered"
        subtitle="Pre-score filter: what it removed, and the rules it uses"
        badge={String(jobs.length)}
        actions={
          <Button
            size="sm"
            variant={confirmBacklog ? "default" : "outline"}
            disabled={backlog.isPending}
            onClick={() => (confirmBacklog ? backlog.mutate() : setConfirmBacklog(true))}
          >
            {confirmBacklog ? "Click again to start (uses LLM credits)" : "Filter & score backlog"}
          </Button>
        }
      />
      <PageMain>
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        <Tabs defaultValue="filtered">
          <TabsList>
            <TabsTrigger value="filtered">Filtered jobs ({jobs.length})</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="filtered" className="space-y-4">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {error ? <p className="text-sm text-destructive">Could not load filtered jobs.</p> : null}
            {!isLoading && !error && jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has been filtered yet.</p>
            ) : null}
            {jobs.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words font-medium hover:underline"
                      >
                        {job.title}
                      </a>
                      <p className="text-sm text-muted-foreground">
                        {job.employer}
                        {job.location ? ` · ${job.location}` : ""}
                        {job.salary ? ` · ${job.salary}` : ""}
                      </p>
                      <p className="text-sm">
                        <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
                          {job.filterLayer}
                        </span>
                        {job.filterReason}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(job.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
          <TabsContent value="rules">
            <PrefilterRulesEditor />
          </TabsContent>
        </Tabs>
      </PageMain>
    </>
  );
};
```

- [ ] **Step 3: Route and nav**

In `orchestrator/src/client/App.tsx`, next to the `WatchlistPage` import:

```tsx
import { FilteredJobsPage } from "./pages/FilteredJobsPage";
```

Next to `<Route path="/watchlist" element={<WatchlistPage />} />`:

```tsx
                <Route path="/filtered" element={<FilteredJobsPage />} />
```

In `orchestrator/src/client/components/navigation.ts`, add `Filter` to the `lucide-react` import list and, before the Settings item:

```ts
  { to: "/filtered", label: "Filtered", icon: Filter },
```

- [ ] **Step 4: Type-check, lint and build the client**

```bash
npm --workspace orchestrator run check:types
npm run format:all
./orchestrator/node_modules/.bin/biome ci .
npm --workspace orchestrator run build:client
```
Expected: all succeed.

- [ ] **Step 5: Look at it** (native dev server on a data copy, see Task 15 Step 2 for the commands): open `/filtered`, switch tabs, edit a keyword, Preview, Save, check that `config/prefilter.json` changed as expected (`git diff config/`), then `git checkout config/prefilter.json` if it was only a test edit. Check the page at phone width (no horizontal scroll).

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/client/pages/filtered/PrefilterRulesEditor.tsx orchestrator/src/client/pages/FilteredJobsPage.tsx orchestrator/src/client/App.tsx orchestrator/src/client/components/navigation.ts
git commit -m "feat(prefilter): add Filtered page with rules editor, preview and backlog run"
```

---

### Task 14: Dry-run script and Docker override

**Files:**
- Create: `orchestrator/scripts/prefilter-dry-run.ts`
- Create: `docker-compose.override.yml`

- [ ] **Step 1: Dry-run script** (read-only; rules only; same logic as the UI Preview)

```ts
/**
 * Usage (from orchestrator/):
 *   npx tsx scripts/prefilter-dry-run.ts <path-to-COPY-of-jobs.db> [--all]
 * Default: unscored discovered jobs. --all: every discovered or skipped job.
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
  console.error("Usage: npx tsx scripts/prefilter-dry-run.ts <copy-of-jobs.db> [--all]");
  process.exit(1);
}

const configPath =
  process.env.PREFILTER_CONFIG_PATH ??
  resolve(process.cwd(), "..", "config", "prefilter.json");
const config = parsePrefilterConfig(JSON.parse(readFileSync(configPath, "utf8")));

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const where = flags.includes("--all")
  ? "status IN ('discovered','skipped')"
  : "status = 'discovered' AND suitability_score IS NULL";
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
  console.log(`${item.decision.padEnd(9)} | ${item.title} @ ${item.employer} | ${item.detail}`);
}
console.log(
  `\n${result.total} jobs: ${result.counts.drop} drop, ${result.counts.keep} keep, ${result.counts.undecided} undecided (→ AI title check)`,
);
```

- [ ] **Step 2: Run it against a copy of your DB** (never the live file)

```bash
mkdir -p /tmp/jobops-dryrun && cp /Users/owenbrown/Documents/Claude/job-ops/data/jobs.db* /tmp/jobops-dryrun/
cd /Users/owenbrown/Documents/Claude/job-ops/orchestrator
npx tsx scripts/prefilter-dry-run.ts /tmp/jobops-dryrun/jobs.db | less
```
Expected: drops first, then undecided, then keeps, plus a summary line. Review every `drop` for false negatives.

- [ ] **Step 3: Docker override** — `docker-compose.override.yml` (merged automatically with `docker-compose.yml`):

```yaml
# Local fork overrides: build from source under a local tag and mount the
# prefilter config read-write so the in-app Rules editor can save it.
services:
  job-ops:
    image: job-ops:local
    pull_policy: build
    volumes:
      - ./config:/app/config
    environment:
      - PREFILTER_CONFIG_PATH=/app/config/prefilter.json
```

(Mount the directory, not the file: saving uses temp-file + rename, which fails on a single-file bind mount.)

- [ ] **Step 4: Build and start from source**

```bash
cd /Users/owenbrown/Documents/Claude/job-ops
GITHUB_TOKEN=${GITHUB_TOKEN:-unused} docker compose up --build -d
docker compose logs -f job-ops
```
Expected: the three new `ALTER TABLE` migrations apply on first start, then the server banner. App at http://localhost:3005. Nothing runs until you start a run. (`GITHUB_TOKEN` is declared as a build secret in compose; the Dockerfile does not read it, so any value works.)

- [ ] **Step 5: Commit**

```bash
git add orchestrator/scripts/prefilter-dry-run.ts docker-compose.override.yml
git commit -m "chore(prefilter): add dry-run script and local Docker override"
```

---

### Task 15: Full verification

**Files:** none

- [ ] **Step 1: CI-parity checks** (from repo root)

```bash
./orchestrator/node_modules/.bin/biome ci .
npm run check:types:shared
npm --workspace orchestrator run check:types
npm --workspace gradcracker-extractor run check:types
npm --workspace ukvisajobs-extractor run check:types
npm --workspace orchestrator run build:client
npm --workspace orchestrator run test:run
```
Expected: all pass (compare against the Task 0 baseline).

- [ ] **Step 2: Start the app on a data copy (native)**

```bash
rm -rf /tmp/jobops-e2e && cp -R /Users/owenbrown/Documents/Claude/job-ops/data /tmp/jobops-e2e
cp /Users/owenbrown/Documents/Claude/job-ops/config/prefilter.json /tmp/jobops-e2e/prefilter.json
cd /Users/owenbrown/Documents/Claude/job-ops/orchestrator
DATA_DIR=/tmp/jobops-e2e npx tsx src/server/db/migrate.ts
DATA_DIR=/tmp/jobops-e2e PREFILTER_CONFIG_PATH=/tmp/jobops-e2e/prefilter.json npm run dev
```
Open http://localhost:5173. Nothing should run on its own.

- [ ] **Step 3: Rules without spending anything**

Filtered → Rules: Preview shows counts for the ~464 unscored jobs. Edit a keyword, Preview again (counts change), Save, and confirm `/tmp/jobops-e2e/prefilter.json` changed. Enter `abc` as the salary floor and Save: an error names `salary.floorAnnualCad` and the file is unchanged.

- [ ] **Step 4: Gate on a normal run** (small: one source, few results)

Start a run from the Jobs page. After discovery it must stop with "Review filter rules before scoring". Confirm no job got a score yet. Click Resume (on the card or Rules tab): the log shows `Prefilter step completed` with `droppedByRules`, `droppedByLlm`, `passed`, then scoring of only `passed` jobs, then the usual auto-tailoring of the top jobs.

- [ ] **Step 5: Backlog button**

Filtered → **Filter & score backlog** → click again to confirm. It must not pause, must not discover, must not tailor. Progress appears on the Jobs page; the Filtered list grows; scored jobs get scores.

- [ ] **Step 6: Restore and audit**

Restore one filtered job: it leaves the Filtered list and shows as discovered/"Not scored" in Jobs. The next run or backlog run scores it without filtering it again. A filtered job opened from Jobs (All tab) shows `Filtered (rules): …` as its fit line.

- [ ] **Step 7: Confirm `data/` is untouched**

```bash
cd /Users/owenbrown/Documents/Claude/job-ops && git status --short
```
Expected: only intended source changes; nothing under `data/`.

---

## Out of scope (deliberately)

- Moving the existing discovery-time location filter and `blockedCompanyKeywords` (still silent, pre-import).
- Per-tenant configs: the config file is global, which is fine for a single-user self-hosted install.
- A Resume button on the Filtered page that appears only while paused (the Rules tab's "Resume paused run" button works any time and reports when nothing is paused).
- Penalising roles that demand formal PM experience: that is a scoring concern. Put it in **Settings → Scoring → Scoring instructions** (currently empty in your DB), e.g. "Candidate has no formal PM title; favour PM roles that don't require PM years, penalise roles requiring 3+ years of direct PM experience. Favour strategy + hands-on execution, zero-to-one, AI-forward teams."

# Overview redesign, Part 3: data enrichment (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Fill the two Overview cards that show hints today: "Response rate by role" and "Why you skip".
- Every scored job gets an AI **role category**: one of the user's search terms, or "Other".
- Skips get a **skip category** from one-click chips.
- Two catch-up passes, started by the user, fill older jobs.

**Architecture:**
- **Two new text columns on `jobs`:** `role_category` and `skip_category`.
- **Role category:** the scorer's JSON schema becomes a function of the current search terms, and the result goes out through the existing `jobUpdates`. Every scoring caller already spreads `jobUpdates` into `updateJob`, so no caller changes are needed.
- **Skip category:**
  - The manual skip action stamps `skip_category = "unspecified"`, which means the user skipped and gave no reason.
  - The skip dialog's chip overwrites it through the existing skip-reason endpoint.
  - System skips (pre-score filter, low-score auto-skip, language auto-skip) leave it `NULL`, so "Why you skip" counts only the user's own skips.
- **Catch-up passes:** one service, `services/overview/backfill.ts`, modelled on `services/prefilter/llm-title-check.ts` (batched `callJson` with a JSON schema).
  - It is exposed as `GET /api/overview/backfill?kind=` (count and estimate) and `POST /api/overview/backfill` (run).
  - The Overview cards show a notice with a button. Nothing runs until it's clicked.

**Spec:** `docs/superpowers/specs/2026-11-11-overview-redesign-design.md`, Part 3. Parts 1 and 2 are done on this branch.

**Departures from the spec:**
- **The `unspecified` marker** separates the user's own skips from system skips (needed because filtered and auto-skipped jobs are also status `skipped`). "No reason given" means user skips marked `unspecified`.
- **Older skips:** user skips from before this change can't be told apart from system skips unless they have a note. Older skips with no note aren't shown.
- **"Why you skip" covers all time**, not the selected range. There is no skipped-at timestamp, and the card says so.
- **The catch-up endpoint lives under `/api/overview/backfill`**, as the spec says. The cost estimate is a token-based approximation using the current price table.

**Environment:**
- Work in `/Users/owenbrown/Documents/Claude/job-ops-overview` (branch `overview-redesign`).
- Run tests from `orchestrator/` with `npx vitest run <paths>`.
- Type check: `npm run check:types`. Lint: `npm run check:all`, from the repo root. Fix formatting with `./orchestrator/node_modules/.bin/biome check --write <files>`.
- `@shared/types` resolves to `shared/src/types.ts`. A new file under `shared/src/types/` must be exported from **both** `shared/src/types.ts` and `shared/src/types/index.ts`.
- Known unrelated failures: 2 date tests in `ApplicationsPerDayChart.test.tsx`.
- **Never** open the real database, and never run a catch-up pass against real data. Owen starts those runs himself.

---

## File map

| File | Change |
|---|---|
| `shared/src/types/enrichment.ts` (new) | `SKIP_CATEGORIES`, `SKIP_CATEGORY_UNSPECIFIED`, `ROLE_CATEGORY_OTHER`, `roleCategoryOptions()`, backfill types |
| `shared/src/types.ts`, `shared/src/types/index.ts` | Export it |
| `shared/src/types/jobs.ts` | `roleCategory`, `skipCategory` on `Job` and `UpdateJobInput` |
| `shared/src/types/overview.ts` | `roles` and `skips.rows` blocks |
| `orchestrator/src/server/db/schema.ts`, `db/migrate.ts`, `db/migrate.test.ts` | New columns, carried through the jobs rebuild |
| `orchestrator/src/server/repositories/jobs.ts` | Map the columns |
| `orchestrator/src/server/services/scorer.ts`, `scorer.test.ts` | Dynamic schema, instruction, `jobUpdates.roleCategory` |
| `orchestrator/src/server/services/jobs/actions.ts` (+ test) | Manual skip stamps `unspecified` |
| `orchestrator/src/server/repositories/prefilter.ts`, `api/routes/prefilter.ts` (+ test) | Skip-reason endpoint also takes `category` |
| `orchestrator/src/client/api/prefilter.ts`, `hooks/queries/useJobMutations.ts`, `components/SkipJobDialog.tsx` (+ test), `pages/JobPage.tsx`, `pages/orchestrator/JobDetailPanel.tsx` | Chips |
| `orchestrator/src/server/services/overview/{compute,load}.ts` (+ test) | Roles and skips sections |
| `orchestrator/src/server/services/overview/backfill.ts` (+ test), `api/routes/overview.ts` (+ test) | Catch-up passes |
| `orchestrator/src/client/api/overview.ts`, `pages/overview/{RolesCard,SkipsCard,CatchUpNotice}.tsx` (+ tests), `pages/OverviewPage.tsx` | Real cards |

---

### Task 1: Shared constants and job columns

**Files:** `shared/src/types/enrichment.ts` (new), `shared/src/types.ts`, `shared/src/types/index.ts`, `shared/src/types/jobs.ts`, `orchestrator/src/server/db/schema.ts`, `orchestrator/src/server/db/migrate.ts`, `orchestrator/src/server/db/migrate.test.ts`, `orchestrator/src/server/repositories/jobs.ts`.

- [ ] **Step 1: Create `shared/src/types/enrichment.ts`**

```ts
import { normalizeSearchTerms } from "../utils/search-terms";

export const ROLE_CATEGORY_OTHER = "Other";

/** One-click reasons offered when skipping a job. */
export const SKIP_CATEGORIES = [
  "Wrong role",
  "Seniority",
  "Location / remote",
  "Salary",
  "Company",
  "Not interested",
] as const;
export type SkipCategoryChoice = (typeof SKIP_CATEGORIES)[number];

/** Stored when the user skipped without picking a reason. System skips stay NULL. */
export const SKIP_CATEGORY_UNSPECIFIED = "unspecified";

/** Values the skip catch-up pass may assign. */
export const SKIP_BACKFILL_CATEGORIES = [...SKIP_CATEGORIES, "Other"] as const;

/** The role categories offered to the AI: the user's search terms plus "Other". */
export function roleCategoryOptions(searchTerms: readonly string[]): string[] {
  const terms = normalizeSearchTerms([...searchTerms]).filter(
    (t) => t.toLowerCase() !== ROLE_CATEGORY_OTHER.toLowerCase(),
  );
  return [...terms, ROLE_CATEGORY_OTHER];
}

export type BackfillKind = "roles" | "skips";

export interface BackfillEstimate {
  kind: BackfillKind;
  /** Jobs the pass would categorize. */
  count: number;
  /** AI calls (batches). */
  calls: number;
  /** Estimated cost in USD, or null when the model has no price. */
  estimatedCost: number | null;
}

export interface BackfillResult {
  kind: BackfillKind;
  categorized: number;
  failedBatches: number;
}
```

Check the export name in `shared/src/utils/search-terms.ts` (`normalizeSearchTerms`) and its import path from `shared/src/types/`. Export the new file from **both** `shared/src/types.ts` and `shared/src/types/index.ts`, in alphabetical order.

- [ ] **Step 2: Add the job fields.** In `shared/src/types/jobs.ts`:
  - Add to `Job`, after `skipReason`:

```ts
  roleCategory?: string | null; // AI role category: a search term or "Other"
  skipCategory?: string | null; // Skip chip, "unspecified", or null for system skips
```

  - Add `roleCategory?: string | null;` and `skipCategory?: string | null;` to `UpdateJobInput`.

- [ ] **Step 3: Write the failing migration test.** In `migrate.test.ts`, find the existing test that seeds `skip_reason` / `cover_letter` and checks they survive the jobs rebuild (around line 580). Extend its seeded row and assertions with `role_category: "Growth manager"` and `skip_category: "Salary"`, in the same style. Then run `cd orchestrator && npx vitest run src/server/db/migrate.test.ts`. Expected: FAIL (no such column).

- [ ] **Step 4: Add the columns.**
  - `migrate.ts`: add `"role_category"` and `"skip_category"` to the `jobsCarriedColumns` array, after `"cover_letter"`. Add `ALTER TABLE jobs ADD COLUMN role_category TEXT` and `ALTER TABLE jobs ADD COLUMN skip_category TEXT` next to the existing `skip_reason` / `cover_letter` ALTERs.
  - `schema.ts`: next to `skipReason`, add `roleCategory: text("role_category"),` and `skipCategory: text("skip_category"),`.
  - `repositories/jobs.ts`: in the row-to-`Job` mapper (around line 935, beside `skipReason: row.skipReason ?? null`), add `roleCategory: row.roleCategory ?? null,` and `skipCategory: row.skipCategory ?? null,`.
  - Check that `updateJob` writes any `UpdateJobInput` key straight into `.set(...)`. If it lists fields one by one, add the two new ones.

- [ ] **Step 5: Run the checks.** Run the migration tests, `src/server/repositories`, and `npm run check:types`. Expected: PASS and clean.

- [ ] **Step 6: Commit.** Message: `feat(db): role_category and skip_category on jobs`.

---

### Task 2: Role category from the scorer

**Files:** `orchestrator/src/server/services/scorer.ts`, `scorer.test.ts`.

- [ ] **Step 1: Write the failing tests** in `scorer.test.ts`, in the `describe` block that already sets up `getEffectiveSettingsMock` / `callJsonMock`. Add `searchTerms: { value: [...], default: [], override: null }` to the settings mock where needed.

```ts
  it("offers the search terms plus Other as role categories and saves the pick", async () => {
    const { scoreJobSuitability } = await import("./scorer");
    getEffectiveSettingsMock.mockResolvedValue({
      penalizeMissingSalary: { value: false, default: false, override: null },
      missingSalaryPenalty: { value: 0, default: 0, override: null },
      scoringInstructions: { value: "", default: "", override: null },
      scoringPromptTemplate: { value: "", default: "", override: null },
      searchTerms: { value: ["growth manager", "product marketing"], default: [], override: null },
    } as any);
    callJsonMock.mockResolvedValue({
      success: true,
      data: { score: 70, reason: "ok", roleCategory: "growth manager" },
    });

    const result = await scoreJobSuitability(createJob({ id: "j1" }), {});

    const call = callJsonMock.mock.calls.at(-1)?.[0];
    expect(call.jsonSchema.schema.properties.roleCategory.enum).toEqual([
      "growth manager",
      "product marketing",
      "Other",
    ]);
    expect(call.jsonSchema.schema.required).toContain("roleCategory");
    expect(result.jobUpdates?.roleCategory).toBe("growth manager");
  });

  it("stores Other when the model returns a value outside the list", async () => {
    const { scoreJobSuitability } = await import("./scorer");
    getEffectiveSettingsMock.mockResolvedValue({
      penalizeMissingSalary: { value: false, default: false, override: null },
      missingSalaryPenalty: { value: 0, default: 0, override: null },
      scoringInstructions: { value: "", default: "", override: null },
      scoringPromptTemplate: { value: "", default: "", override: null },
      searchTerms: { value: ["growth manager"], default: [], override: null },
    } as any);
    callJsonMock.mockResolvedValue({
      success: true,
      data: { score: 70, reason: "ok", roleCategory: "astronaut" },
    });
    const result = await scoreJobSuitability(createJob({ id: "j2" }), {});
    expect(result.jobUpdates?.roleCategory).toBe("Other");
  });
```

Use the job factory the file already uses (`createJob` from `@shared/testing/factories` or whatever is imported). Run it and confirm it fails.

- [ ] **Step 2: Implement.** In `scorer.ts`:
  1. Rename the constant `SCORING_SCHEMA` to `BASE_SCORING_SCHEMA` and add the builder below. Use `buildScoringSchema(roleOptions)` in the `callJson` call.

```ts
function buildScoringSchema(roleOptions: string[]): JsonSchemaDefinition {
  const base = BASE_SCORING_SCHEMA.schema as {
    properties: Record<string, unknown>;
    required: string[];
  };
  return {
    ...BASE_SCORING_SCHEMA,
    schema: {
      ...BASE_SCORING_SCHEMA.schema,
      properties: {
        ...base.properties,
        roleCategory: {
          type: "string",
          enum: roleOptions,
          description:
            "Which of the candidate's search roles this job is, judged by the actual work, not only the title. Other if none fit.",
        },
      },
      required: [...base.required, "roleCategory"],
    },
  };
}
```

  2. In `scoreJobSuitability`, after the settings resolve:

```ts
  const roleOptions = roleCategoryOptions(settings.searchTerms?.value ?? []);
```

  Import `roleCategoryOptions` and `ROLE_CATEGORY_OTHER` from `@shared/types`.

  3. Add `roleCategory?: string;` to the `callJson<...>` result type.

  4. Add a role instruction:
     - Add a 5th numbered task to `SCORING_OUTPUT_INSTRUCTIONS`: `5. ROLE CATEGORY: set roleCategory to the one listed search role this job is, judged by the work described (a "Client Engagement Director" doing growth work counts as that growth role). Use "Other" when none fit.`
     - Add `"roleCategory": "<one of the listed roles, or Other>"` to its JSON shape example.
     - The list of roles comes from the enum. Also append a line to the prompt with the options: find where `SCORING_OUTPUT_INSTRUCTIONS` is joined into the prompt (`buildScoringPrompt`) and append `\nRole options: ${roleOptions.join(" | ")}`. If `buildScoringPrompt` isn't the right place, append to the message content in `scoreJobSuitability`.

  5. Before the return, merge the category into `jobUpdates`:

```ts
  const pickedRole =
    typeof result.data.roleCategory === "string" &&
    roleOptions.includes(result.data.roleCategory)
      ? result.data.roleCategory
      : ROLE_CATEGORY_OTHER;
```

  Then return `jobUpdates: { ...patchResult.updates, roleCategory: pickedRole }`.

- [ ] **Step 3: Run the tests.** Run `npx vitest run src/server/services/scorer.test.ts src/server/pipeline src/server/services/jobs src/server/api/routes/manual-jobs*` and `npm run check:types`. Expected: PASS. If an existing test asserts an exact `jobUpdates` object or exact schema, update it to include `roleCategory`, and say so in the report.

- [ ] **Step 4: Commit.** Message: `feat(scoring): role category from the user's search terms`.

---

### Task 3: Skip category, server side

**Files:** `orchestrator/src/server/services/jobs/actions.ts` (+ its test), `orchestrator/src/server/repositories/prefilter.ts`, `orchestrator/src/server/api/routes/prefilter.ts` (+ `prefilter.test.ts` route test).

- [ ] **Step 1: Write the failing tests.**
  - **Jobs action tests** (find the existing test of `action: "skip"`, e.g. `api/routes/jobs.test.ts` or `services/jobs/actions.test.ts`): skipping a discovered job gives `skipCategory === "unspecified"`.
  - **Prefilter route tests** (`api/routes/prefilter.test.ts`):
    - `PUT /api/prefilter/jobs/:id/skip-reason` with `{ reason: "", category: "Salary" }` on a skipped job gives `skipCategory: "Salary"` and `skipReason: null`.
    - `{ reason: "too far", category: null }` keeps the existing category unchanged. `category` omitted also means unchanged.
    - `{ category: "Bogus" }` returns 400.

  Run them and confirm they fail.

- [ ] **Step 2: Implement.**
  - **`actions.ts` skip branch:** `jobsRepo.updateJob(jobId, { status: "skipped", skipCategory: SKIP_CATEGORY_UNSPECIFIED })`.
  - **`repositories/prefilter.ts`:** replace `setSkipReason(id, reason)` with `setSkipNote(id, { reason, category })`.
    - `reason: string | null | undefined` and `category: string | null | undefined`. `undefined` means leave the field unchanged, `null` clears it.
    - Build the `.set({...})` from the defined keys plus `updatedAt`, with the same `WHERE` (scoped, id, status skipped).
    - Update the one existing caller.
  - **Route:** the body schema becomes:

```ts
const skipReasonBodySchema = z.object({
  reason: z.string().trim().max(1000).nullable().optional(),
  category: z.enum(SKIP_CATEGORIES).nullable().optional(),
});
```

  Pass `reason` (empty string becomes null) and `category` through, and respond `{ id, skipReason, skipCategory }` from the updated row. Re-read it, or return the values you set. Keep the demo-mode `forbidden` guard.

- [ ] **Step 3: Run the tests.** Run the touched tests and `npm run check:types`. Expected: PASS.

- [ ] **Step 4: Commit.** Message: `feat(skip): record who skipped and the chosen reason`.

---

### Task 4: Skip chips in the dialog

**Files:** `orchestrator/src/client/components/SkipJobDialog.tsx` (+ `SkipJobDialog.test.tsx`, new or existing), `client/api/prefilter.ts`, `client/hooks/queries/useJobMutations.ts`, `client/pages/JobPage.tsx`, `client/pages/orchestrator/JobDetailPanel.tsx`.

- [ ] **Step 1: Write the failing test** (`SkipJobDialog.test.tsx`).

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkipJobDialog } from "./SkipJobDialog";

describe("SkipJobDialog chips", () => {
  it("sends the picked reason chip with the note", () => {
    const onConfirm = vi.fn();
    render(<SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("radio", { name: "Salary" }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "too low" } });
    fireEvent.click(screen.getByRole("button", { name: /skip job/i }));
    expect(onConfirm).toHaveBeenCalledWith({ note: "too low", category: "Salary" });
  });

  it("lets the user skip without a chip, and un-pick a chip", () => {
    const onConfirm = vi.fn();
    render(<SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);
    const chip = screen.getByRole("radio", { name: "Company" });
    fireEvent.click(chip);
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: /skip job/i }));
    expect(onConfirm).toHaveBeenCalledWith({ note: "", category: null });
  });
});
```

If the textarea's label text is "Reason (optional)", `getByLabelText(/reason/i)` may also match the chip group's label. Give the chip group the accessible name "Reason" and the textarea "Note (optional)", and query `/note/i`. Run the test and confirm it fails.

- [ ] **Step 2: Implement the dialog.**
  - `onConfirm` becomes `(input: { note: string; category: SkipCategoryChoice | null }) => void`.
  - Above the textarea, render a `div role="radiogroup" aria-label="Reason"` with one `button` per `SKIP_CATEGORIES` value:
    - attributes: `role="radio"`, `aria-checked`, `type="button"`;
    - classes: `rounded-full border px-3 py-1 text-xs`;
    - selected: `border-primary bg-primary/10 text-foreground`; unselected: `border-border text-muted-foreground`.
  - Clicking the selected chip clears it. Reset the chip when the dialog opens, as `reason` is reset.
  - Rename the textarea label to "Note (optional)" and update the description text: "Pick a reason or add a note. Both are optional."

- [ ] **Step 3: Wire it through.**
  - `client/api/prefilter.ts`: `saveSkipReason(id, reason, category?)` sends `{ reason, category }`. Update the return type to include `skipCategory`.
  - `useJobMutations.ts`:
    - `SkipJobInput` becomes `string | { id: string; reason?: string | null; category?: string | null }`.
    - After `skipJob`, call `saveSkipReason` when there's a note **or** a category.
    - Return `{ ...job, skipReason, skipCategory }`.
  - `JobPage.tsx` and `JobDetailPanel.tsx`: `confirmSkip` takes `{ note, category }` and calls `mutateAsync({ id, reason: note, category })`.
  - Grep for other `SkipJobDialog` / `confirmSkip` / `saveSkipReason` users and update them.

- [ ] **Step 4: Run the tests.** Run `npx vitest run src/client/components/SkipJobDialog.test.tsx src/client/pages/JobPage.test.tsx src/client/pages/orchestrator src/client/hooks` and `npm run check:types`. Expected: PASS. Existing tests that check `saveSkipReason` call arguments need the extra `category` argument; update them.

- [ ] **Step 5: Commit.** Message: `feat(skip): one-click reason chips`.

---

### Task 5: Overview roles and skips sections

**Files:** `shared/src/types/overview.ts`, `orchestrator/src/server/services/overview/compute.ts` (+ test), `orchestrator/src/server/services/overview/load.ts`.

- [ ] **Step 1: Extend the types.** In `overview.ts`:

```ts
export interface OverviewRoleRow extends OverviewRateRow {
  category: string;
}

// in OverviewResponse:
  roles: {
    rows: OverviewRoleRow[];
    /** Share of categorized applications in "Other"; null with none categorized. */
    otherShare: number | null;
    uncategorizedApplied: number;
  };
  skips: {
    rows: { reason: string; count: number }[];
    highScoreSkipped: OverviewSkippedJob[];
    uncategorizedWithNote: number;
  };
```

  Also add `export const OVERVIEW_FOCUS_OTHER_SHARE = 0.2;` and `export const SKIP_REASON_NONE_LABEL = "No reason given";`.

- [ ] **Step 2: Write the failing compute tests.**
  - Add `roleCategory: null` and `skipCategory: null`, `skipReason: null`, `filterLayer: null` to the test's `job()` defaults.
  - Then add:

```ts
describe("roles", () => {
  it("groups in-range applications by role category", () => {
    const result = computeOverview(
      input({
        jobs: [
          job({ id: "1", roleCategory: "growth manager" }),
          job({ id: "2", roleCategory: "growth manager" }),
          job({ id: "3", roleCategory: "Other" }),
          job({ id: "4", roleCategory: null }),
        ],
        stageEvents: [event("1", "screening", 2)],
      }),
    );
    expect(result.roles.rows).toEqual([
      { category: "growth manager", applied: 2, replied: 1 },
      { category: "Other", applied: 1, replied: 0 },
    ]);
    expect(result.roles.otherShare).toBeCloseTo(1 / 3, 5);
    expect(result.roles.uncategorizedApplied).toBe(1);
  });
});

describe("skip reasons", () => {
  it("counts only the user's own skips, all time", () => {
    const skip = (over: Partial<OverviewJobRow> & { id: string }) =>
      job({ status: "skipped", appliedAt: null, discoveredAt: iso(300), ...over });
    const result = computeOverview(
      input({
        jobs: [
          skip({ id: "a", skipCategory: "Salary" }),
          skip({ id: "b", skipCategory: "Salary" }),
          skip({ id: "c", skipCategory: "unspecified" }),
          skip({ id: "d", skipCategory: null, skipReason: "3 days in office" }), // legacy note
          skip({ id: "e", skipCategory: null, skipReason: "Needs French" }), // system
          skip({ id: "f", skipCategory: null, filterLayer: "rules", skipReason: null }), // filtered
          skip({ id: "g", skipCategory: null }), // auto-skip
        ],
      }),
    );
    expect(result.skips.rows).toEqual([
      { reason: "Salary", count: 2 },
      { reason: "No reason given", count: 1 },
    ]);
    expect(result.skips.uncategorizedWithNote).toBe(1);
  });
});
```

  Run them and confirm they fail.

- [ ] **Step 3: Implement.**
  - **Row types:** add `roleCategory: string | null; skipCategory: string | null; skipReason: string | null; filterLayer: string | null;` to `OverviewJobRow`, and select those four columns in `load.ts`.
  - **Roles:** over `inRange`, group by `job.roleCategory` (skip nulls, but count them in `uncategorizedApplied`). Rows are sorted by `applied` descending, then name. Put "Other" last whatever its count. `otherShare = otherApplied / categorizedApplied`, or `null` when `categorizedApplied` is 0.
  - **Skip rows:** over **all** jobs with `status === "skipped"`:
    - `skipCategory === "unspecified"` counts as "No reason given";
    - any other non-null category counts as itself;
    - `null` is ignored.
    - Sort by count descending, with "No reason given" last.
  - **`uncategorizedWithNote`:** the legacy-note test. Skipped, `skipCategory === null`, `filterLayer` is not `rules` or `llm`, `skipReason` is non-empty and does not match `/^Needs /`. Export this predicate as `isLegacyUserSkipNote(job)` from `compute.ts`, because Task 6 reuses it.

- [ ] **Step 4: Run the tests.** Run `npx vitest run src/server/services/overview src/server/api/routes/overview.test.ts` and `npm run check:types`. Expected: PASS. The client's `OverviewPage.test.tsx` fixture now needs `roles` and `skips.rows` / `uncategorizedWithNote`. Add them so types pass.

- [ ] **Step 5: Commit.** Message: `feat(overview): role and skip-reason breakdowns`.

---

### Task 6: Catch-up passes

**Files:** `orchestrator/src/server/services/overview/backfill.ts` (+ `backfill.test.ts`), `orchestrator/src/server/api/routes/overview.ts` (+ test), `orchestrator/src/client/api/overview.ts`.

Design:
- **Testability:** the AI is injected through `deps` (like `llm-title-check.ts`), so tests never call a real model.
- **Batches:** batches of 25.
- **Labelling and cost:** `feature: "other"`, so spend tracking records it and the Spend page shows the cost.
- **Prompt input:** only the job title (roles) or the note (skips), each numbered.
- **Writes:** each batch writes only rows whose value is still `NULL`, so a run can be repeated safely.

- [ ] **Step 1: Write the failing tests** (`backfill.test.ts`). Use the temp-DB harness the repository tests use (see `repositories/post-application-messages.test.ts` or `api/routes/test-utils.ts`), seed jobs, and pass fake `deps`:

```ts
const fakeDeps = (answer: (ids: string[]) => Record<string, string>) => ({
  createService: async () => ({
    callJson: vi.fn(async ({ messages }: { messages: { content: string }[] }) => {
      const ids = [...messages.at(-1)!.content.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1]);
      const picked = answer(ids);
      return {
        success: true,
        data: { results: ids.map((id) => ({ id, category: picked[id] })) },
      };
    }),
  }),
  resolveModel: async () => "test-model",
  getSearchTerms: async () => ["growth manager"],
});
```

Cases:
1. `estimateBackfill("roles")` counts only applied jobs with null `role_category`. Here that's 2 of 3. `calls` is 1.
2. `runBackfill("roles", deps)` sets `role_category` on those 2 (`"growth manager"` and `"Other"` from the fake answers). An already-categorized job is untouched. A second run categorizes 0.
3. A category outside the allowed list is stored as `"Other"`.
4. `runBackfill("skips", deps)` only touches `isLegacyUserSkipNote` jobs. A "Needs French" job and a filtered job stay null.
5. A batch whose `callJson` returns `{ success: false }` increments `failedBatches` and leaves those rows null.

Run them and confirm they fail.

- [ ] **Step 2: Implement `backfill.ts`**, exporting:
  - `estimateBackfill(kind)` returning `BackfillEstimate`, and `runBackfill(kind, deps = defaultDeps)` returning `BackfillResult`.
  - **Candidates:** load the scoped rows. For roles: `appliedAt IS NOT NULL AND role_category IS NULL`. For skips: load skipped jobs with `skip_category IS NULL` and filter with `isLegacyUserSkipNote`.
  - **Allowed values:** roles use `roleCategoryOptions(await deps.getSearchTerms())`; skips use `SKIP_BACKFILL_CATEGORIES`.
  - **Prompt:**
    - The system prompt states the task and the allowed values.
    - The user prompt has one line per item: `[n] <title or note>`. Strip `<>` and collapse whitespace; truncate notes to 300 characters.
    - Schema: `{ results: [{ id: string, category: enum(allowed) }] }`.
  - **Writes:** map the answers back by index, then `UPDATE jobs SET <column> = ? WHERE id = ? AND <column> IS NULL`, scoped with `privateDataScopeFilter(jobs)`.
  - **Estimate:**

    ```
    calls = ceil(count / 25)
    tokens_in  ≈ calls × 400 + count × 25
    tokens_out ≈ count × 15
    ```

    Price the tokens with `findModelPrice` / `costOf` from `services/spend/pricing.ts` and the scoring model from `resolveLlmModel("scoring")`. Read those helpers' signatures first. Return `null` when the model has no price.
  - **Defaults:** `defaultDeps` uses `createConfiguredLlmService("scoring")`, `resolveLlmModel("scoring")`, and `getSearchTerms` from `getEffectiveSettings()` (`searchTerms.value`).
  - **Failures:** log and skip a failed batch; never throw part-way.

- [ ] **Step 3: Add the routes** to `api/routes/overview.ts`:
  - `GET /backfill?kind=roles|skips` returns `estimateBackfill(kind)`.
  - `POST /backfill` with body `{ kind }` returns `runBackfill(kind)`. Throw `forbidden(...)` in demo mode (`isDemoMode()`, as `prefilter.ts` does). Run inline: a few dozen jobs take seconds.
  - Route tests: estimate shape, demo-mode POST forbidden, and a bad `kind` returns 400. Don't run a real POST without stubbing; inject deps or mock `./backfill` with `vi.mock`.

- [ ] **Step 4: Client API.** Add `getBackfillEstimate(kind)` and `runBackfill(kind)` to `client/api/overview.ts`.

- [ ] **Step 5: Run the tests.** Run the touched tests and `npm run check:types`. Expected: PASS.

- [ ] **Step 6: Commit.** Message: `feat(overview): opt-in catch-up passes for roles and skip notes`.

---

### Task 7: Real Roles and Why-you-skip cards

**Files:** `pages/overview/CatchUpNotice.tsx` (new), `RolesCard.tsx`, `SkipsCard.tsx`, `InsightsCards.test.tsx`, `OverviewPage.tsx` (+ test), all under `orchestrator/src/client/`.

- [ ] **Step 1: Write the failing tests** (add to `InsightsCards.test.tsx`; mock `getBackfillEstimate` / `runBackfill` on `@/client/api` as the file mocks `updateJob`):
  - **`RolesCard` with rows:**
    - Rows `[{category:"growth manager",applied:18,replied:7},{category:"Other",applied:6,replied:0}]` with `otherShare: 0.25` and `uncategorizedApplied: 0` show "7 of 18 · 39%" and a focus note matching `/25% of applications fall outside your search roles/`.
    - With `otherShare: 0.1`, there's no focus note.
    - A row with `applied` below 3 shows "1 of 2" and no bar.
  - **`RolesCard` empty:** no rows and `uncategorizedApplied: 0` shows "Appears once your applications are scored." (no notice).
  - **`CatchUpNotice`:**
    - With `count: 23` and `estimatedCost: 0.02`, it shows "23 applications have no role category" and "est. $0.02".
    - Clicking "Categorize" calls `runBackfill("roles")`.
    - Nothing calls `runBackfill` before the click.
  - **`SkipsCard`:** rows `[{reason:"Salary",count:4},{reason:"No reason given",count:2}]` render both with counts and a caption "All time". It still lists `highScoreSkipped` with Reconsider.

  Run them and confirm they fail.

- [ ] **Step 2: Implement.**
  - **`CatchUpNotice({ kind, noun })`:**
    - `useQuery` on `getBackfillEstimate(kind)`. Render nothing when `count === 0`.
    - Text: `${count} ${noun} have no ${kind === "roles" ? "role category" : "reason category"}.`
    - Show `est. $x.xx` when `estimatedCost` isn't null, and `${calls} AI call(s)` otherwise.
    - A "Categorize" button runs a `useMutation(runBackfill(kind))`. On success it invalidates `queryKeys.overview.all` and toasts `Categorized N`. A non-zero `failedBatches` adds ", some failed. Try again later."
    - While pending, the button shows "Categorizing…" and is disabled.
    - Query key: add `overview.backfill: (kind) => [...overview.all, "backfill", kind]` to `queryKeys`.
  - **`RolesCard({ roles })`:**
    - Rows use `rateLabel` and a bar `percent(replied, applied)%` only when `canShowRate(applied)`.
    - The focus note appears when `otherShare !== null && otherShare >= OVERVIEW_FOCUS_OTHER_SHARE`: `${Math.round(otherShare*100)}% of applications fall outside your search roles.`
    - `<CatchUpNotice kind="roles" noun="applications" />` sits under the rows.
    - Empty text: "Appears once your applications are scored."
  - **`SkipsCard({ rows, highScoreSkipped })`:**
    - A caption "All time" sits next to the title.
    - Horizontal bars of `count / max(count)` width, using `bg-muted-foreground/60` for "No reason given" and `bg-primary` for the rest. Each label shows its count in mono.
    - `<CatchUpNotice kind="skips" noun="skipped jobs" />`.
    - Empty text: "Skip reasons appear once you start picking them when you skip a job."
    - The existing "Skipped but scored 80+" list stays.
  - **`OverviewPage.tsx`:** pass `roles={data.roles}` and `rows={data.skips.rows}`, and update its test fixture.

- [ ] **Step 3: Run the tests.** Run `npx vitest run src/client/pages/overview src/client/pages/OverviewPage.test.tsx` and `npm run check:types`. Expected: PASS.

- [ ] **Step 4: Commit.** Message: `feat(overview): role and skip-reason cards with catch-up notices`.

---

### Task 8: Verification

- [ ] **Step 1: Run the checks.** Run `npm run check:types`, `npm run check:all` and `cd orchestrator && npx vitest run`. Expected: all pass, apart from the 2 known chart failures.
- [ ] **Step 2: Check it in demo mode** (fresh temporary `DATA_DIR`, as in Part 2 Task 9).
  - Screenshot `/overview` (desktop and 390px, dark and light) and the skip dialog: open a Ready job, click Skip, then screenshot.
  - Demo data has no role or skip categories, so expect the empty states plus catch-up notices. **Do not click Categorize.** It would call the AI, and demo mode forbids it anyway.
- [ ] **Step 3: Report** to the user, including the reminder that the catch-up passes against real data are the user's to start from the Overview page.

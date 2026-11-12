# Overview redesign, Part 1: stage model (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight application stages with five (`applied, screening, interview, offer, closed`). Add one shared "stage → pipeline bucket" mapping. Turn the Applications board into five bucket lanes.

**Architecture:**
- The stage list lives in `shared/src/types/jobs.ts`, and every consumer derives from it.
- A new pure module, `shared/src/pipeline-buckets.ts`, maps a stage and outcome to one of five display buckets. It also maps each bucket back to the transition a board drop should make.
- A boot-time SQL step rewrites old stage values in `stage_events`.
- Email routing accepts old stage targets and converts them when read, so older inbox rows keep working without rewriting their JSON.

**Tech stack:** TypeScript, React 18, TanStack Query, Drizzle and better-sqlite3, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-11-11-overview-redesign-design.md` (Part 1).

**Precondition:** the nav consolidation's Applications stage has landed, so the board lives at `/applications/board`. It has: `App.tsx` redirects to `/applications/board`, and `InProgressBoardPage` renders through `PageFrame`.

**Environment notes:**
- Node 24 works.
- Run tests from `orchestrator/`: `npx vitest run <paths>`. Vitest there also picks up `../shared/src/**/*.test.ts`.
- Type check from the repo root: `npm run check:types`.
- Known unrelated failures: the two date-dependent tests in `src/client/components/charts/ApplicationsPerDayChart.test.tsx`.
- **Never** open the live database while Docker is running.

---

## Stage mapping (used throughout)

| Old stage | New stage |
|---|---|
| `applied` | `applied` |
| `recruiter_screen` | `screening` |
| `assessment` | `screening` |
| `hiring_manager_screen` | `screening` |
| `technical_interview` | `interview` |
| `onsite` | `interview` |
| `offer` | `offer` |
| `closed` | `closed` |

**Watch out:** `INTERVIEW_TYPES` (`recruiter_screen`, `technical`, `onsite`, …) and the workplace type `"onsite"` are **not** stages. Leave them alone. Only change a string where it's typed as or used as an `ApplicationStage`, a `PostApplicationRouterStageTarget`, or a stage column value.

## File map

| File | Change |
|---|---|
| `shared/src/types/jobs.ts` | New `APPLICATION_STAGES`, `STAGE_LABELS`, and `LEGACY_STAGE_MAP` |
| `shared/src/types/post-application.ts` | New `POST_APPLICATION_ROUTER_STAGE_TARGETS` |
| `shared/src/pipeline-buckets.ts` (new) | `PIPELINE_BUCKETS`, `bucketFor`, `transitionForBucket` |
| `shared/src/pipeline-buckets.test.ts` (new) | Unit tests |
| `shared/src/index.ts` | Export the new module |
| `orchestrator/src/server/services/post-application/stage-target.ts` | New mappings, plus old-target conversion |
| `orchestrator/src/server/services/post-application/stage-target.test.ts` (new) | Unit tests |
| `orchestrator/src/server/services/post-application/ingestion/email-router.ts` | One prompt line explaining the stages |
| `orchestrator/src/server/db/migrate.ts` | Convert old stage values; update the status backfill list |
| `orchestrator/src/server/db/migrate.test.ts` | Migration test |
| `orchestrator/src/server/services/applicationTracking.ts` | Stage sets |
| `orchestrator/src/server/repositories/product-analytics.ts` | Stage sets |
| `orchestrator/src/server/config/demo-defaults.ts`, `demo-defaults.data.ts` | Demo stage values |
| `orchestrator/src/index.css` | `--bucket-*` tokens |
| `orchestrator/src/client/components/LogEventModal.tsx` | Stage options |
| `orchestrator/src/client/pages/job/Timeline.tsx` | Stage icons |
| `orchestrator/src/client/components/charts/ConversionAnalytics.tsx`, `ResponseRateBySourceChart.tsx` | Stage sets |
| `orchestrator/src/client/pages/InProgressBoardPage.tsx` | Bucket lanes and drop rules |
| Tests and stories that still use old stage names | Renamed per the mapping |

---

### Task 1: New stage types and the pipeline-buckets module

**Files:**
- Modify: `shared/src/types/jobs.ts:20-42`
- Modify: `shared/src/types/post-application.ts:49-61`
- Create: `shared/src/pipeline-buckets.ts`
- Create: `shared/src/pipeline-buckets.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test** in `shared/src/pipeline-buckets.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  bucketFor,
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
  transitionForBucket,
} from "./pipeline-buckets";
import { APPLICATION_STAGES, LEGACY_STAGE_MAP } from "./types/jobs";

describe("APPLICATION_STAGES", () => {
  it("is the five-stage model", () => {
    expect(APPLICATION_STAGES).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "closed",
    ]);
  });

  it("maps every legacy stage to a current stage", () => {
    expect(LEGACY_STAGE_MAP).toEqual({
      recruiter_screen: "screening",
      assessment: "screening",
      hiring_manager_screen: "screening",
      technical_interview: "interview",
      onsite: "interview",
    });
  });
});

describe("PIPELINE_BUCKETS", () => {
  it("has five buckets in display order with labels", () => {
    expect(PIPELINE_BUCKETS).toEqual([
      "awaiting",
      "screening",
      "interview",
      "offer",
      "rejected",
    ]);
    expect(PIPELINE_BUCKET_LABELS).toEqual({
      awaiting: "Awaiting reply",
      screening: "Screening",
      interview: "Interview",
      offer: "Offer",
      rejected: "Rejected",
    });
  });
});

describe("bucketFor", () => {
  it.each([
    ["applied", null, "awaiting"],
    ["screening", null, "screening"],
    ["interview", null, "interview"],
    ["offer", null, "offer"],
    ["closed", "rejected", "rejected"],
    ["closed", "ghosted", "awaiting"],
    ["closed", "no_response", "awaiting"],
    ["closed", "offer_accepted", "offer"],
    ["closed", "offer_declined", "offer"],
    ["closed", null, "rejected"],
  ] as const)("%s + %s -> %s", (stage, outcome, expected) => {
    expect(bucketFor(stage, outcome)).toBe(expected);
  });

  it("leaves withdrawn applications out", () => {
    expect(bucketFor("closed", "withdrawn")).toBeNull();
  });

  it("ignores an outcome on a stage that is not closed", () => {
    expect(bucketFor("interview", "rejected")).toBe("interview");
  });
});

describe("transitionForBucket", () => {
  it.each([
    ["awaiting", { toStage: "applied", outcome: null }],
    ["screening", { toStage: "screening", outcome: null }],
    ["interview", { toStage: "interview", outcome: null }],
    ["offer", { toStage: "offer", outcome: null }],
    ["rejected", { toStage: "closed", outcome: "rejected" }],
  ] as const)("%s", (bucket, expected) => {
    expect(transitionForBucket(bucket)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd orchestrator && npx vitest run ../shared/src/pipeline-buckets.test.ts`
Expected: FAIL, with `Failed to resolve import "./pipeline-buckets"`.

- [ ] **Step 3: Replace the stage block** in `shared/src/types/jobs.ts` (the `APPLICATION_STAGES` const through the end of `STAGE_LABELS`) with:

```ts
export const APPLICATION_STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "closed",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

/** Stage values from before the five-stage model, mapped to their replacement. */
export const LEGACY_STAGE_MAP: Readonly<Record<string, ApplicationStage>> = {
  recruiter_screen: "screening",
  assessment: "screening",
  hiring_manager_screen: "screening",
  technical_interview: "interview",
  onsite: "interview",
};
```

- [ ] **Step 4: Replace `POST_APPLICATION_ROUTER_STAGE_TARGETS`** in `shared/src/types/post-application.ts` with:

```ts
export const POST_APPLICATION_ROUTER_STAGE_TARGETS = [
  "no_change",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
] as const;
```

- [ ] **Step 5: Create `shared/src/pipeline-buckets.ts`**

```ts
import type { ApplicationStage, JobOutcome } from "./types/jobs";

/** Display buckets for an application, in pipeline order. */
export const PIPELINE_BUCKETS = [
  "awaiting",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;

export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_BUCKET_LABELS: Record<PipelineBucket, string> = {
  awaiting: "Awaiting reply",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

/**
 * Which bucket an application belongs in. Returns null for withdrawn
 * applications, which are left out of the pipeline. Ghosted / no response
 * count as still awaiting a reply (the user does not follow up).
 */
export function bucketFor(
  stage: ApplicationStage,
  outcome: JobOutcome | null,
): PipelineBucket | null {
  switch (stage) {
    case "applied":
      return "awaiting";
    case "screening":
      return "screening";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "closed":
      if (outcome === "withdrawn") return null;
      if (outcome === "ghosted" || outcome === "no_response") return "awaiting";
      if (outcome === "offer_accepted" || outcome === "offer_declined") {
        return "offer";
      }
      return "rejected";
  }
}

/** The stage transition a board drop into `bucket` should make. */
export function transitionForBucket(bucket: PipelineBucket): {
  toStage: ApplicationStage;
  outcome: JobOutcome | null;
} {
  switch (bucket) {
    case "awaiting":
      return { toStage: "applied", outcome: null };
    case "screening":
      return { toStage: "screening", outcome: null };
    case "interview":
      return { toStage: "interview", outcome: null };
    case "offer":
      return { toStage: "offer", outcome: null };
    case "rejected":
      return { toStage: "closed", outcome: "rejected" };
  }
}
```

- [ ] **Step 6: Export it.** In `shared/src/index.ts`, add after the `./location-support` line:

```ts
export * from "./pipeline-buckets";
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `cd orchestrator && npx vitest run ../shared/src/pipeline-buckets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 8: Fix shared's own type errors.**

Run: `npm run check:types:shared` (repo root).
- For each error in `shared/src/**`, replace old stage strings using the stage mapping table.
- `shared/src/stage-history.test.ts`: `recruiter_screen` → `screening`, `technical_interview` → `interview`.
- Re-run until it's clean.

The orchestrator type check **will** fail until Task 8. That's expected.

- [ ] **Step 9: Commit**

```bash
git add shared/src
git commit -m "feat(shared): five-stage application model and pipeline buckets"
```

---

### Task 2: Email-routing stage targets

**Files:**
- Modify: `orchestrator/src/server/services/post-application/stage-target.ts`
- Create: `orchestrator/src/server/services/post-application/stage-target.test.ts`
- Modify: `orchestrator/src/server/services/post-application/ingestion/email-router.ts:176`

- [ ] **Step 1: Write the failing test** in `stage-target.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  messageTypeFromStageTarget,
  normalizeStageTarget,
  resolveStageTransitionForTarget,
  stageTargetFromMessageType,
} from "./stage-target";

describe("normalizeStageTarget", () => {
  it("accepts current targets", () => {
    expect(normalizeStageTarget("screening")).toBe("screening");
    expect(normalizeStageTarget("rejected")).toBe("rejected");
  });

  it.each([
    ["recruiter_screen", "screening"],
    ["assessment", "screening"],
    ["hiring_manager_screen", "screening"],
    ["technical_interview", "interview"],
    ["onsite", "interview"],
  ])("converts legacy %s to %s", (legacy, expected) => {
    expect(normalizeStageTarget(legacy)).toBe(expected);
  });

  it("rejects unknown values", () => {
    expect(normalizeStageTarget("phone_call")).toBeNull();
    expect(normalizeStageTarget(42)).toBeNull();
  });
});

describe("stageTargetFromMessageType", () => {
  it.each([
    ["update", "screening"],
    ["interview", "interview"],
    ["offer", "offer"],
    ["rejection", "rejected"],
    ["other", "no_change"],
  ] as const)("%s -> %s", (type, target) => {
    expect(stageTargetFromMessageType(type)).toBe(target);
  });
});

describe("messageTypeFromStageTarget", () => {
  it.each([
    ["applied", "update"],
    ["screening", "update"],
    ["interview", "interview"],
    ["offer", "offer"],
    ["rejected", "rejection"],
    ["withdrawn", "rejection"],
    ["closed", "rejection"],
    ["no_change", "other"],
  ] as const)("%s -> %s", (target, type) => {
    expect(messageTypeFromStageTarget(target)).toBe(type);
  });
});

describe("resolveStageTransitionForTarget", () => {
  it("closes rejected applications with the rejected outcome", () => {
    expect(resolveStageTransitionForTarget("rejected")).toEqual({
      toStage: "closed",
      outcome: "rejected",
      reasonCode: "rejected",
    });
  });

  it("passes plain stages through", () => {
    expect(resolveStageTransitionForTarget("interview")).toEqual({
      toStage: "interview",
      outcome: null,
      reasonCode: null,
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd orchestrator && npx vitest run src/server/services/post-application/stage-target.test.ts`
Expected: FAIL. The legacy conversions return `null`, and `update` still maps to `recruiter_screen`.

- [ ] **Step 3: Update `stage-target.ts`.** Replace `normalizeStageTarget`, `messageTypeFromStageTarget` and `stageTargetFromMessageType` with the code below. `resolveStageTransitionForTarget` stays as it is.

```ts
import type {
  ApplicationStage,
  JobOutcome,
  PostApplicationMessageType,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import {
  LEGACY_STAGE_MAP,
  POST_APPLICATION_ROUTER_STAGE_TARGETS,
} from "@shared/types";

const STAGE_TARGET_VALUES = new Set<PostApplicationRouterStageTarget>(
  POST_APPLICATION_ROUTER_STAGE_TARGETS,
);

/** Accepts current targets and converts pre-five-stage ones stored in old rows. */
export function normalizeStageTarget(
  value: unknown,
): PostApplicationRouterStageTarget | null {
  if (typeof value !== "string") return null;
  if (STAGE_TARGET_VALUES.has(value as PostApplicationRouterStageTarget)) {
    return value as PostApplicationRouterStageTarget;
  }
  return LEGACY_STAGE_MAP[value] ?? null;
}

export function messageTypeFromStageTarget(
  target: PostApplicationRouterStageTarget,
): PostApplicationMessageType {
  if (target === "interview") return "interview";
  if (target === "offer") return "offer";
  if (target === "rejected" || target === "withdrawn" || target === "closed") {
    return "rejection";
  }
  if (target === "applied" || target === "screening") return "update";
  return "other";
}

export function stageTargetFromMessageType(
  messageType: PostApplicationMessageType,
): PostApplicationRouterStageTarget {
  if (messageType === "interview") return "interview";
  if (messageType === "offer") return "offer";
  if (messageType === "rejection") return "rejected";
  if (messageType === "update") return "screening";
  return "no_change";
}
```

Check that `LEGACY_STAGE_MAP` is reachable through `@shared/types`. It's declared in `shared/src/types/jobs.ts`, which `shared/src/types/index.ts` re-exports. If the import fails, import from `@shared/types/jobs` instead.

- [ ] **Step 4: Add stage guidance to the router prompt.** In `email-router.ts`, directly below the line `- stageTarget must be one of: ${POST_APPLICATION_ROUTER_STAGE_TARGETS.join("|")}.`, add:

```
- screening = recruiter/HR call, assessment or take-home, early screen; interview = interviews with the team or hiring manager, technical or final rounds.
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd orchestrator && npx vitest run src/server/services/post-application/stage-target.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/server/services/post-application
git commit -m "feat(post-application): route emails to the five-stage model"
```

---

### Task 3: Convert old stage values at boot

**Files:**
- Modify: `orchestrator/src/server/db/migrate.ts` (the "Backfill: Sync legacy workflow status" block, around line 1185)
- Modify: `orchestrator/src/server/db/migrate.test.ts`

- [ ] **Step 1: Write the failing test.** Append inside the `describe.sequential("database migrations", …)` block in `migrate.test.ts`:

```ts
  it("rewrites pre-five-stage values in stage_events", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const run = (script: string) =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        { env: { ...process.env, DATA_DIR: tempDir as string }, stdio: "pipe" },
      );

    // Boot once to create the schema, then insert legacy rows.
    run(`
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";
      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);
      const db = new Database(join(process.env.DATA_DIR, "jobs.db"));
      db.pragma("foreign_keys = OFF");
      const insert = db.prepare(
        "INSERT INTO stage_events (id, application_id, from_stage, to_stage, occurred_at) VALUES (?, 'job-1', ?, ?, 1)",
      );
      insert.run("e1", "applied", "recruiter_screen");
      insert.run("e2", "recruiter_screen", "assessment");
      insert.run("e3", "assessment", "hiring_manager_screen");
      insert.run("e4", "hiring_manager_screen", "technical_interview");
      insert.run("e5", "technical_interview", "onsite");
      insert.run("e6", "onsite", "offer");
      db.close();
    `);

    // Boot again: the conversion runs on every boot and must be harmless to repeat.
    run(`
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";
      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);
      const db = new Database(join(process.env.DATA_DIR, "jobs.db"), { readonly: true });
      const rows = db.prepare("SELECT id, from_stage, to_stage FROM stage_events ORDER BY id").all();
      const expected = [
        ["e1", "applied", "screening"],
        ["e2", "screening", "screening"],
        ["e3", "screening", "screening"],
        ["e4", "screening", "interview"],
        ["e5", "interview", "interview"],
        ["e6", "interview", "offer"],
      ];
      const actual = rows.map((r) => [r.id, r.from_stage, r.to_stage]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("Unexpected stages: " + JSON.stringify(actual));
      }
      db.close();
    `);
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd orchestrator && npx vitest run src/server/db/migrate.test.ts -t "pre-five-stage"`
Expected: FAIL with `Unexpected stages: [["e1","applied","recruiter_screen"], …]`.

- [ ] **Step 3: Add the conversion.** In `migrate.ts`, find the `migrations` array entry beginning with the comment `// Backfill: Sync legacy workflow status from latest stage event.`
  - Insert these four entries **immediately before** that comment:

```ts
  // Five-stage model: rewrite pre-five-stage values. Safe to run on every boot.
  `UPDATE stage_events SET to_stage = 'screening' WHERE to_stage IN ('recruiter_screen', 'assessment', 'hiring_manager_screen')`,
  `UPDATE stage_events SET to_stage = 'interview' WHERE to_stage IN ('technical_interview', 'onsite')`,
  `UPDATE stage_events SET from_stage = 'screening' WHERE from_stage IN ('recruiter_screen', 'assessment', 'hiring_manager_screen')`,
  `UPDATE stage_events SET from_stage = 'interview' WHERE from_stage IN ('technical_interview', 'onsite')`,
```

  - Then, in that backfill statement, replace the `IN (...)` list:

```sql
     ), 'applied') IN (
       'screening',
       'interview',
       'offer',
       'closed'
     )`,
```

- [ ] **Step 4: Run the migration tests**

Run: `cd orchestrator && npx vitest run src/server/db/migrate.test.ts`
Expected: PASS (the new test and all existing ones).

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/server/db
git commit -m "feat(db): convert pre-five-stage values in stage_events at boot"
```

---

### Task 4: Server stage sets (tracking, analytics, demo data)

**Files:**
- Modify: `orchestrator/src/server/services/applicationTracking.ts:35-59`
- Modify: `orchestrator/src/server/repositories/product-analytics.ts:41-54`
- Modify: `orchestrator/src/server/config/demo-defaults.ts`, `orchestrator/src/server/config/demo-defaults.data.ts`

- [ ] **Step 1: Update `applicationTracking.ts`.** Replace the three constants with:

```ts
const STAGE_TO_STATUS: Record<ApplicationStage, JobStatus> = {
  applied: "applied",
  screening: "in_progress",
  interview: "in_progress",
  offer: "in_progress",
  closed: "in_progress",
};

const POSITIVE_RESPONSE_STAGES = new Set<ApplicationStage>([
  "screening",
  "interview",
  "offer",
]);

const INTERVIEW_STAGES = new Set<ApplicationStage>(["interview"]);
```

- [ ] **Step 2: Update `product-analytics.ts`.** Replace both constants with:

```ts
const POSITIVE_RESPONSE_STAGES = ["screening", "interview", "offer"] as const;

const INTERVIEW_STAGES = ["interview"] as const;
```

- [ ] **Step 3: Update the demo data.** In `demo-defaults.ts` and `demo-defaults.data.ts`, change every `fromStage:` and `toStage:` value using the stage mapping table:
  - `recruiter_screen`, `assessment`, `hiring_manager_screen` → `screening`
  - `technical_interview`, `onsite` → `interview`

  Leave `title:` text such as "Take-home assessment sent" and the `id:` strings unchanged.

- [ ] **Step 4: Fix the server tests that use old names.** Run:

```bash
cd orchestrator && grep -rlnE "recruiter_screen|hiring_manager_screen|technical_interview|\"assessment\"|\"onsite\"" src/server --include='*.test.ts'
```

- In each listed file, rename **stage** values only (`toStage`, `fromStage`, `to_stage`, `stageTarget`, `suggestedStageTarget`, and expected stage strings) using the mapping.
- Leave interview types and workplace types alone.
- If a test asserted an exact count that depended on two old stages now collapsing into one, update the expected value and note it in the commit message.

- [ ] **Step 5: Run the server tests**

Run: `cd orchestrator && npx vitest run src/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/src/server
git commit -m "refactor(server): use the five-stage model in tracking, analytics and demo data"
```

---

### Task 5: Bucket colour tokens

**Files:**
- Modify: `orchestrator/src/index.css`

- [ ] **Step 1: Add the Tailwind colour aliases.** In the `@theme inline` block, after `--color-info-foreground: var(--info-foreground);`, add:

```css
  --color-bucket-awaiting: var(--bucket-awaiting);
  --color-bucket-screening: var(--bucket-screening);
  --color-bucket-interview: var(--bucket-interview);
  --color-bucket-offer: var(--bucket-offer);
  --color-bucket-rejected: var(--bucket-rejected);
```

- [ ] **Step 2: Add the tokens.** In the `:root` block, after `--info-foreground: …;`, add the lines below.
  - They reference other theme tokens, so `.dark` picks up the dark values automatically and doesn't need its own copy.
  - A future theme can override them in one place.

```css
  /* Pipeline buckets (Overview bar, Applications board). */
  --bucket-awaiting: var(--muted-foreground);
  --bucket-screening: var(--info);
  --bucket-interview: var(--warning);
  --bucket-offer: var(--success);
  --bucket-rejected: var(--destructive);
```

- [ ] **Step 3: Check that the build picks them up**

Run: `cd orchestrator && npx vite build --logLevel error`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add orchestrator/src/index.css
git commit -m "feat(ui): pipeline bucket colour tokens"
```

---

### Task 6: Client stage options, labels and charts

**Files:**
- Modify: `orchestrator/src/client/components/LogEventModal.tsx:49-59`
- Modify: `orchestrator/src/client/pages/job/Timeline.tsx:7-34`
- Modify: `orchestrator/src/client/components/charts/ConversionAnalytics.tsx:69-90`
- Modify: `orchestrator/src/client/components/charts/ResponseRateBySourceChart.tsx:60-67`

- [ ] **Step 1: Update `LogEventModal.tsx`.** Replace the stage option list entries between `no_change` and `Rejected` so the list reads:

```ts
  { label: "No Stage Change (Keep current status)", value: "no_change" },
  { label: STAGE_LABELS.applied, value: "applied" },
  { label: STAGE_LABELS.screening, value: "screening" },
  { label: STAGE_LABELS.interview, value: "interview" },
  { label: STAGE_LABELS.offer, value: "offer" },
  { label: "Rejected", value: "rejected" },
  { label: "Withdrawn", value: "withdrawn" },
  { label: STAGE_LABELS.closed, value: "closed" },
```

- [ ] **Step 2: Update `Timeline.tsx`.**
  - Replace `stageIcons` with the code below.
  - Remove the now-unused `FileText`, `Presentation` and `UserRound` imports, unless they're used elsewhere in the file. Check with grep.

```tsx
const stageIcons: Record<ApplicationStage, React.ReactNode> = {
  applied: <CheckCircle2 className="h-4 w-4" />,
  screening: <PhoneCall className="h-4 w-4" />,
  interview: <Video className="h-4 w-4" />,
  offer: <MailCheck className="h-4 w-4" />,
  closed: <ClipboardList className="h-4 w-4" />,
};
```

- [ ] **Step 3: Update `ConversionAnalytics.tsx`.** Replace the three stage sets with:

```ts
// Stages that count as "screening"
const SCREENING_STAGES = new Set(["screening"]);

// Stages that count as "interview" (for funnel display)
const INTERVIEW_STAGES = new Set(["interview"]);

// Stages that count as conversion (any positive response from company)
const CONVERSION_STAGES = new Set(["screening", "interview", "offer"]);
```

- [ ] **Step 4: Update `ResponseRateBySourceChart.tsx`.** Replace `RESPONSE_STAGES` with:

```ts
const RESPONSE_STAGES = new Set(["screening", "interview", "offer"]);
```

- [ ] **Step 5: Fix the client tests and stories that use old names.** Run:

```bash
cd orchestrator && grep -rlnE "recruiter_screen|hiring_manager_screen|technical_interview|\"assessment\"|\"onsite\"" src/client src/lib
```

- In each listed file, rename **stage** values only using the mapping.
- Skip interview types (`INTERVIEW_TYPES`) and workplace types (`workplaceTypes`, `"remote" | "hybrid" | "onsite"`). `AutomaticRunTab.test.tsx`, `OrchestratorPage.test.tsx` and `OnboardingPage.tsx` only have workplace hits, so leave them.

- [ ] **Step 6: Run the client tests touched**

Run: `cd orchestrator && npx vitest run src/client/components src/client/pages/job src/client/lib`
Expected: PASS, apart from the two known date-dependent `ApplicationsPerDayChart` failures.

- [ ] **Step 7: Commit**

```bash
git add orchestrator/src/client orchestrator/src/lib
git commit -m "refactor(ui): five-stage options, timeline icons and chart stage sets"
```

---

### Task 7: Applications board with five bucket lanes

**Files:**
- Modify: `orchestrator/src/client/pages/InProgressBoardPage.tsx`
- Modify: `orchestrator/src/client/pages/InProgressBoardPage.test.tsx`

`bucketFor` and `transitionForBucket` already have unit tests (Task 1). Here the page test checks the lanes render, and the drop rules come from `transitionForBucket`.

- [ ] **Step 1: Write the failing test.** Read `InProgressBoardPage.test.tsx` and reuse its existing render and mocking setup: `api.getJobs` and `api.getJobStageEvents` mocks, and the QueryClient wrapper. Add:

```tsx
  it("shows the five pipeline bucket lanes", async () => {
    renderBoard(); // use the file's existing render helper
    for (const label of [
      "Awaiting reply",
      "Screening",
      "Interview",
      "Offer",
      "Rejected",
    ]) {
      expect(
        await screen.findByRole("region", { name: `${label} lane` }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("region", { name: "Closed lane" }),
    ).not.toBeInTheDocument();
  });

  it("puts ghosted jobs in Awaiting reply and hides withdrawn ones", async () => {
    // Mock two jobs: "ghosted-job" with outcome "ghosted" and "withdrawn-job"
    // with outcome "withdrawn". Both have a last stage event toStage "closed".
    // Build them with the file's existing job and stage-event mocks.
    renderBoard();
    const awaiting = await screen.findByRole("region", {
      name: "Awaiting reply lane",
    });
    expect(within(awaiting).getByText("Ghosted Co")).toBeInTheDocument();
    expect(screen.queryByText("Withdrawn Co")).not.toBeInTheDocument();
  });
```

If the file has no `renderBoard` helper, wrap its existing render call in one at the top of the `describe`. Give the two mocked jobs `employer: "Ghosted Co"` and `employer: "Withdrawn Co"`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd orchestrator && npx vitest run src/client/pages/InProgressBoardPage.test.tsx`
Expected: FAIL. There's no "Awaiting reply lane", and there's still a "Closed lane".

- [ ] **Step 3: Rewrite the lane model in `InProgressBoardPage.tsx`.**

Imports: replace the `@shared/types.js` import with:

```ts
import {
  bucketFor,
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
  type PipelineBucket,
  transitionForBucket,
} from "@shared/pipeline-buckets";
import type {
  ApplicationStage,
  JobListItem,
  StageEvent,
} from "@shared/types.js";
```

`@shared/types.js` re-exports only `shared/src/types`, so the bucket helpers come from `@shared/pipeline-buckets`. The `@shared/*` alias points at `shared/src/*`. If `STAGE_LABELS` is no longer used in the file after this task, drop it.

Replace the `BoardCard` type, `BOARD_STAGES`, `getCardLeftAccentClass` and `resolveCurrentStage` with:

```ts
type BoardCard = {
  job: JobListItem;
  stage: ApplicationStage;
  bucket: PipelineBucket;
  latestEventAt: number | null;
};

const getCardLeftAccentClass = (bucket: PipelineBucket) => {
  if (bucket === "interview") {
    return "border-l-2 border-l-bucket-interview/60";
  }
  if (bucket === "offer") {
    return "border-2 border-bucket-offer/50 shadow-[0_4px_12px_-4px_color-mix(in_oklch,var(--color-bucket-offer)_70%,transparent)]";
  }
  return "";
};

const resolveCurrentStage = (
  events: StageEvent[] | null,
): { stage: ApplicationStage; latestEventAt: number | null } => {
  const latest = events?.at(-1) ?? null;
  if (latest) {
    return { stage: latest.toStage, latestEventAt: latest.occurredAt };
  }
  return { stage: "applied", latestEventAt: null };
};
```

In `boardQuery.queryFn`, change the `jobs.map(…)` return to work out each card's bucket and drop withdrawn jobs:

```ts
      return jobs.flatMap((job, index) => {
        const result = eventResults[index];
        const events =
          result?.status === "fulfilled"
            ? [...result.value].sort((a, b) => a.occurredAt - b.occurredAt)
            : null;
        const resolved = resolveCurrentStage(events);
        const outcome = events?.at(-1)?.outcome ?? job.outcome ?? null;
        const bucket = bucketFor(resolved.stage, outcome);
        if (bucket === null) return [];
        return [
          {
            job,
            stage: resolved.stage,
            bucket,
            latestEventAt: resolved.latestEventAt,
          },
        ];
      });
```

State: change the drag and drop-target types from stages to buckets:

```ts
  const [dragging, setDragging] = React.useState<{
    jobId: string;
    fromBucket: PipelineBucket;
  } | null>(null);
  const [dropTargetBucket, setDropTargetBucket] =
    React.useState<PipelineBucket | null>(null);
```

The transition mutation sends an outcome:

```ts
  const transitionMutation = useMutation({
    mutationFn: ({ jobId, bucket }: { jobId: string; bucket: PipelineBucket }) => {
      const { toStage, outcome } = transitionForBucket(bucket);
      return api.transitionJobStage(jobId, {
        toStage,
        outcome,
        metadata: {
          actor: "user",
          eventType: "status_update",
          eventLabel: `Moved to ${PIPELINE_BUCKET_LABELS[bucket]}`,
          reasonCode: "in_progress_board_drag",
        },
      });
    },
  });
```

Lanes are grouped by bucket:

```ts
    const grouped: Record<PipelineBucket, BoardCard[]> = {
      awaiting: [],
      screening: [],
      interview: [],
      offer: [],
      rejected: [],
    };

    for (const card of cards) {
      grouped[card.bucket].push(card);
    }

    for (const bucket of PIPELINE_BUCKETS) {
      grouped[bucket].sort(sortFn);
    }
```

Rewrite `handleDropToStage` as `handleDropToBucket(toBucket: PipelineBucket)`:
- Compare against `dragging.fromBucket`.
- In the optimistic update, set `bucket: toBucket` and `stage: transitionForBucket(toBucket).toStage`.
- Call `transitionMutation.mutateAsync({ jobId, bucket: toBucket })`.
- Toast `Moved to ${PIPELINE_BUCKET_LABELS[toBucket]}`.
- Celebrate when `toBucket === "offer"`.
- Use `setDropTargetBucket` everywhere `setDropTargetStage` was used.

In the JSX:
- Map `PIPELINE_BUCKETS.map((bucket) => …)` instead of `BOARD_STAGES`.
- Use `aria-label={`${PIPELINE_BUCKET_LABELS[bucket]} lane`}` and show `PIPELINE_BUCKET_LABELS[bucket]` in the `<h2>`.
- The collapse toggle and `isCollapsedApplied` test for `bucket === "awaiting"`. Its aria-labels read "Expand Awaiting reply lane" / "Collapse Awaiting reply lane". Keep the existing storage key so the saved preference carries over.
- Add a 3px coloured top border to each lane header: `style={{ borderTopColor: `var(--color-bucket-${bucket})` }}` together with `border-t-[3px]` on the `<header>` className. This uses the new tokens and works in both themes.
- Cards: `cardClassName={getCardLeftAccentClass(bucket)}`, `onDragStart` sets `{ jobId: job.id, fromBucket: bucket }`, and `onLogEvent` still passes `{ job, stage }`. The Log Event flow keeps working on exact stages.

- [ ] **Step 4: Run the board tests**

Run: `cd orchestrator && npx vitest run src/client/pages/InProgressBoardPage.test.tsx`
Expected: PASS (new and existing tests). If an existing test expected a lane name like "Recruiter Screen lane", update it to the bucket label.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/client/pages/InProgressBoardPage.tsx orchestrator/src/client/pages/InProgressBoardPage.test.tsx
git commit -m "feat(board): five pipeline-bucket lanes shared with the Overview"
```

---

### Task 8: Full verification

- [ ] **Step 1: Type check everything**

Run (repo root): `npm run check:types`
Expected: no errors.
- Fix each remaining error with the stage mapping table. Likely places: `InProgressBoardCard.stories.tsx`, `JobPage.tsx` casts, `post-application/review/service.ts`.
- Commit those fixes as `refactor: finish five-stage rename`.

- [ ] **Step 2: Search for leftover old stage values**

Run:

```bash
grep -rnE "recruiter_screen|hiring_manager_screen|technical_interview" orchestrator/src shared/src --include='*.ts' --include='*.tsx' | grep -v INTERVIEW_TYPES
```

Expected hits only:
- `LEGACY_STAGE_MAP` in `shared/src/types/jobs.ts`
- the legacy cases in `stage-target.test.ts`, `pipeline-buckets.test.ts` and `migrate.test.ts`
- the migration SQL in `migrate.ts`
- `INTERVIEW_TYPES` (`recruiter_screen` there is an interview type)

Then check that each remaining `"assessment"` and `"onsite"` hit is a keyword, a workplace type or an interview type: `grep -rnE "\"assessment\"|\"onsite\"" orchestrator/src shared/src`.

- [ ] **Step 3: Lint and format**

Run (repo root): `npm run check:all`
Expected: passes. If formatting fails, run `npm run format:all` and commit as `style: format`.

- [ ] **Step 4: Full test suite**

Run: `cd orchestrator && npx vitest run`
Expected: all pass, apart from the two known `ApplicationsPerDayChart` date failures.

- [ ] **Step 5: Check it in the UI with demo data (never Owen's database)**

```bash
export DEMO_DIR=$(mktemp -d)
cd orchestrator && DATA_DIR=$DEMO_DIR npm run db:migrate
DATA_DIR=$DEMO_DIR DEMO_MODE=true PORT=3001 npm run dev
```

Open `http://localhost:5173/applications/board`. Check:
- The five lanes are there.
- The demo cards appear in Screening and Interview.
- Dragging a card to Rejected moves it, and it stays there after a reload.
- The Log Event modal lists Applied / Screening / Interview / Offer / Rejected / Withdrawn / Closed.
- The job timeline shows the new labels.
- Both the light and dark themes look right.

Stop the dev server when done.

- [ ] **Step 6: Report.** Summarize the test results, plus anything that differed from this plan, to the user. Don't push.

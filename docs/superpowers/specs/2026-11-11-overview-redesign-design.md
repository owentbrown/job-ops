# Overview redesign: design

**Status:** approved in brainstorming · 2026-11-11
**Brief:** `Overview-V2/OVERVIEW_REDESIGN.md` (structure and content). The mockup `Overview-V2/overview-reference.html` guides structure only.
**Related:** `2026-11-11-nav-consolidation-design.md` owns navigation and routes. This spec uses its routes: `/applications/board`, `/applications/inbox`, `/jobs/ready`, `/jobs/discovered`.

## Goal

Replace the Overview page with a dashboard in three sections: Pipeline, Needs your action, Insights. Use the **current app theme**, not the mockup's colours and fonts. The theme redesign is a separate project. Along the way:

- Simplify the application stages to five.
- Make the Applications board use the same five buckets.
- Add the data the insights need: a role category per job and a skip category per skip.

## Decisions

| Topic | Decision |
|---|---|
| Visual style | Current theme tokens, fonts, and dark/light support. Mockup colours, fonts and sidebar changes are out of scope. |
| Stage model | Replace the stages (not just their display) with `applied, screening, interview, offer, closed`. There's no history in the old stages yet. |
| Pipeline buckets | Awaiting reply, Screening, Interview, Offer, Rejected. Ghosted / no response count as Awaiting reply. Withdrawn is left out of the bar and shown as "+N withdrawn". |
| Board | Five lanes, one per bucket. The Closed lane is dropped. |
| Role breakdown | During scoring, the AI picks a role category from the current search terms plus "Other". A raw job title is too fragmented to chart, and the search term that found a job doesn't say what the role is. |
| Skip reasons | Optional one-click chips in the skip dialog, plus a one-time AI pass that sorts older free-text notes. |
| What counts as a reply | The job moved to Screening or later, or was closed as rejected. |
| Time to first reply | The earlier of the first stage change after `applied` and the first matched email. |
| Reconsider (skipped jobs that scored 80+) | Sets the job back to `discovered`. No AI cost. |
| Old Overview | Kept at `/overview/classic` with no nav link. Deleted later. |
| Architecture | One server endpoint, `GET /api/overview`, works out every number. |

## Build order

This is one spec, shipped in three parts. Part 1's board changes land after the nav consolidation's "Applications" stage, so the board work happens at `/applications/board`.

1. Stage model
2. Overview page
3. Data enrichment

---

## Part 1: Stage model

### Shared types (`shared/src/types/jobs.ts`)
- `APPLICATION_STAGES = ["applied", "screening", "interview", "offer", "closed"]`.
- `STAGE_LABELS`: Applied, Screening, Interview, Offer, Closed.
- `APPLICATION_OUTCOMES` and `INTERVIEW_TYPES` stay the same. Interview types describe a scheduled interview, not a stage.

### Bucket mapping (new: `shared/src/pipeline-buckets.ts`)
- `PIPELINE_BUCKETS`: `awaiting, screening, interview, offer, rejected`, each with a label, in that fixed order.
- `bucketFor(stage, outcome): PipelineBucket | null`

| Stage / outcome | Bucket |
|---|---|
| `applied` | awaiting |
| `closed` + `ghosted` or `no_response` | awaiting |
| `screening` | screening |
| `interview` | interview |
| `offer` | offer |
| `closed` + `offer_accepted` or `offer_declined` | offer |
| `closed` + `rejected` | rejected |
| `closed` + `withdrawn` | `null` (left out) |
| `closed` + no outcome | rejected |

Both the Overview endpoint and the board import this module, so the two can't disagree.

### Migration (`orchestrator/src/server/db/migrate.ts`)
One update that's safe to run more than once. It converts old stage values in:
- `stage_events.from_stage` and `stage_events.to_stage`
- stage values inside the JSON in `post_application_messages.stage_event_payload`
- any other column that stores an application stage

Old to new:
- `recruiter_screen`, `assessment`, `hiring_manager_screen` → `screening`
- `technical_interview`, `onsite` → `interview`

The Drizzle enums in `schema.ts` take the new list.

### Email matching (`server/services/post-application/stage-target.ts`, `shared/src/types/post-application.ts`)
- `POST_APPLICATION_ROUTER_STAGE_TARGETS` = `applied, screening, interview, offer, rejected, withdrawn, closed, no_change`.
- `stageTargetFromMessageType`:
  - `update` → `screening`
  - `interview` → `interview`
  - `offer` → `offer`
  - `rejection` → `rejected`
  - anything else → `no_change`
- `messageTypeFromStageTarget` follows the same mapping in reverse.
- The router prompt's list of allowed stages is updated.
- `normalizeStageTarget` also accepts old values and converts them with the old-to-new mapping, so older inbox items still resolve.

### Application tracking (`server/services/applicationTracking.ts`)
Update the table linking each stage to a job status and the ordered stage list for the new stages. Behaviour doesn't change: every stage after `applied` sets the job to `in_progress`.

### UI
- **Applications board** (`InProgressBoardPage`):
  - Lanes come from `PIPELINE_BUCKETS`, and cards are placed with `bucketFor`.
  - Dropping a card on a lane:
    - Awaiting → `applied`
    - Screening → `screening`
    - Interview → `interview`
    - Offer → `offer`
    - Rejected → `closed` + `rejected`
  - Withdrawn jobs aren't shown.
  - The collapse toggle moves from the Applied lane to the Awaiting reply lane.
  - Lane colours use the new `--bucket-*` theme tokens (see Part 2).
- **Log Event modal:** new stage options. Rejected and Withdrawn stay as closing actions.
- **Timeline:** new labels.
- **Demo data** (`config/demo-defaults*.ts`, demo seed and simulator): new stages.
- **Old chart components** used only by the classic Overview (`ConversionAnalytics`, `ResponseRateBySourceChart`): update their stage references so they still compile and work.

### Tests
- `bucketFor`: every stage and outcome combination.
- Migration: old rows are rewritten, and running it twice is safe.
- Stage-target mappings, both directions, including old inputs.
- Board drop rules.
- Update existing tests and stories that use the old stage names.

---

## Part 2: Overview page

### Endpoint: `GET /api/overview?range=7|14|30|90`
- The response type `OverviewResponse` lives in `shared/src/types/overview.ts`.
- The server works out each section in its own function in `server/services/overview/`, one file per section, each tested on its own.
- `range` applies to pace, replies and insights. The pipeline snapshot always covers every application.

```ts
type OverviewResponse = {
  pipeline:   { total: number; buckets: Record<PipelineBucket, number>; withdrawn: number };
  actions:    { readyCount: number; discoveredCount: number; inboxPendingCount: number };
  engine:     { schedule: string | null; allJobsCount: number;
                lastRun: { searches: number; searchesTotal: number; results: number; unique: number } | null };
  pace:       { perDay: { date: string; count: number }[]; avgPerDay: number;
                bestDay: { date: string; count: number } | null; medianFoundToAppliedDays: number | null };
  replies:    { applied: number; replied: number; responseRate: number | null;
                medianDaysToReply: number | null; emailsMatched: number };
  roles:      { rows: { category: string; applied: number; replied: number }[];
                otherShare: number | null; uncategorizedApplied: number };
  skips:      { rows: { reason: string; count: number }[];
                highScoreSkipped: { jobId: string; title: string; employer: string; score: number }[];
                uncategorizedWithNote: number };
  sources:    { rows: { source: string; results: number; applied: number; replied: number }[] };
  scoreBands: { rows: { band: "<70" | "70-79" | "80-89" | "90+"; applied: number; replied: number }[] };
};
```

Value definitions:
- **Applications:** jobs with `appliedAt` set.
- **`pipeline.total`:** applications whose bucket isn't `null` (withdrawn jobs excluded).
- **Replied:** see the "What counts as a reply" decision.
- **`emailsMatched`:** inbox messages matched to a job within the range.
- **Source `results`:** jobs found from that source within the range.
- **`highScoreSkipped`:** skipped jobs that scored 80 or more, highest first, up to 10.

### Page layout (`pages/overview/`)
`OverviewPage` shows, top to bottom:

1. **Header:** the title "Overview" and the existing `DurationSelector`. The range is still saved in the URL as `duration`.
2. **01 Pipeline:** `PipelineCard`.
   - The total, a segmented bar and a legend showing each bucket's label, count and %.
   - Segments with a count of zero are hidden; visible segments are at least 10px wide.
   - An `aria-label` lists every count.
   - Shows "+N withdrawn" when N is above 0.
3. **02 Needs your action:** `ActionTiles`, then `EngineStatusStrip`.
   - Tiles wrap, with a minimum width of about 280px. Each has a label, a big number and a link.
   - **Browser check:** shown only when the existing pipeline-progress subscription reports `pendingChallenges`. It names the board, uses the warning style, and its "Solve" button opens the Jobs page, where the existing solve flow runs.
   - **Jobs to review** → `/jobs/ready`.
   - **New jobs discovered** → `/jobs/discovered`.
   - **Emails to match or confirm** → `/applications/inbox`.
   - A tile with nothing to do shows 0 in calm styling.
   - **Status strip:** schedule · last run's searches · results · unique · all jobs.
4. **03 Insights:**
   - `PaceCard`: bars per day, with the average per day, best day, and found → applied time.
   - `RepliesCard`: three tiles for response rate, median time to reply, and emails matched.
   - `RolesCard`: horizontal bars labelled like "7 of 18 · 39%". Shows the focus-check note when `otherShare` is 20% or more, e.g. "28% of applications fall outside your search roles."
   - `SkipsCard`: bars of skip reasons, and the "Skipped but scored 80+" list with a Reconsider button per row.
   - `SourceYieldTable`: one row per source, with results, applied, replied and reply rate.
   - `ScoreBandsCard`: reply rate per score band, with a one-line takeaway.
- Each metric appears in exactly one place.
- **Styling:**
  - Existing theme tokens and shadcn components, in both themes.
  - New `--bucket-awaiting|screening|interview|offer|rejected` tokens defined for light and dark, used by the Overview and the board.
  - Numbers use the existing mono font. Section headers are a small mono index plus a serif title, in the current fonts.
- **Accessibility:** tiles and the bar have aria-labels, colour is never the only signal, and text contrast is at least 4.5:1.

### Empty states
- **Reply rates:** shown only once at least 1 reply exists.
- **Breakdown rows:** a percentage only once the row has at least 3 applications.
- **Below those thresholds:** "—" plus a one-line hint, e.g. "Too early to read. These fill in after your first reply."
- **Role and skip cards with no categorized data:** a hint, plus the catch-up notice from Part 3.
- Never show fake or 0% bars.

### Reconsider
`PATCH` the job's status to `discovered` with the existing job update call, then refresh the overview query.

### Old page
- `HomePage` is renamed `ClassicOverviewPage` and served at `/overview/classic`, with no nav link.
- `/overview` serves `OverviewPage`.
- `OverviewPipelineRunsSection` stays with the classic page.

### Tests
- **Server:** seed jobs, stage events and messages with known values, then check each section's numbers, range filtering and empty-state nulls.
- **Client:**
  - `PipelineCard`: zero segments hidden, the aria-label, the withdrawn note.
  - Empty-state rendering for replies, roles and skips.
  - Action tiles: the challenge tile appears only when pending.
  - Reconsider calls the update.
  - Routes: `/overview` and `/overview/classic` both load.

---

## Part 3: Data enrichment

### Role category
- **Storage:** a new column `jobs.role_category TEXT NULL`, plus `roleCategory` on `Job`.
- **Scorer** (`server/services/scorer.ts`): the scoring JSON schema gets a required `roleCategory` enum, built from the normalized current `searchTerms` plus `"Other"`.
  - It's saved alongside the score, and rescoring overwrites it.
  - A value outside the list is saved as `"Other"`.
- Jobs keep the category they were given when search terms change. Rescoring a job sorts it again under the current terms.

### Skip category
- **Storage:** a new column `jobs.skip_category TEXT NULL`, plus `skipCategory` on `Job`. The free-text `skipReason` stays as the note.
- **Shared constant `SKIP_CATEGORIES`:** "Wrong role", "Seniority", "Location / remote", "Salary", "Company", "Not interested". The catch-up pass may also assign "Other".
- **`SkipJobDialog`:** optional single-select chips above the existing note field. Both values are sent through the existing skip action.
- **Overview grouping:** by `skip_category`. Skipped jobs with neither a category nor a note show as "No reason given".

### One-time catch-up passes (only when the user starts them)
- **Endpoint:** `POST /api/overview/backfill { kind: "roles" | "skips" }`.
- **Roles:** applied jobs with `role_category IS NULL`. A title-only prompt picks from the same enum, in batches.
- **Skips:** skipped jobs with a non-empty `skipReason` and `skip_category IS NULL`. A prompt picks from `SKIP_CATEGORIES` plus "Other". Blank notes aren't touched.
- **Runs through** the existing AI provider and spend tracking, so the cost shows on the Spend page.
- **Can be repeated safely:** it only fills empty rows.
- **Started from the app**, never by a script outside it: the database lives in Docker.
  - The Roles and Skips cards show "N applications have no role category. Categorize · est. $X" when `uncategorizedApplied` or `uncategorizedWithNote` is above 0. The estimate comes from existing spend data.
  - Nothing runs until the user clicks.

### Tests
- The scorer saves `roleCategory`, and values outside the list become "Other".
- The skip dialog sends the chip.
- The catch-up passes only touch empty rows and are safe to run twice (stubbed AI).
- The Overview groups correctly, including "No reason given" and the 20% "Other" threshold.

---

## Out of scope
- Sidebar and navigation changes (the nav consolidation spec covers them).
- The mockup's colours and fonts, and the theme switcher.
- Tracer-link data, follow-up tracking, aging timelines, goals, avatars and logos.
- A new home for the detailed pipeline-runs history (it stays on `/overview/classic`).

## Known issues
- **Upstream merges:** changes upstream to stages, the scorer or the board will conflict. Keep the edits confined to the files listed here.
- **Known unrelated flaky tests:** the date-dependent tests in `ApplicationsPerDayChart.test.tsx`.

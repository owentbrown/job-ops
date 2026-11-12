# Nav consolidation and Profile shell: design

**Status:** approved (approach A, staged rollout) · 2026-11-11
**Mockups:** "JobOps nav: Option A" canvas (boards *Option A: 5-item navigation* and *Profile v2*)
**Related:** `Overview-V2/OVERVIEW_REDESIGN.md` and the "JobOps Redesign Concept" canvas (Overview v3). That work owns the Overview page and the visual theme. This spec owns the navigation structure only.

## Goal

The sidebar drops from 11 items to 5, grouped by stage of the job search. Pages move without changing what they do. Every old URL keeps working through a redirect. Profile becomes the home for "you" (About you) and the documents built from you (Document Studio).

## Final sidebar

| # | Item | Route | Contains |
|---|---|---|---|
| 1 | Overview | `/overview` | Unchanged `HomePage`. Placeholder until Overview v3 ships. |
| 2 | Jobs | `/jobs/:tab` | Tabs: Ready, Discovered, All Jobs, **Filtered** (new tab) |
| 3 | Applications | `/applications/:tab` | Tabs: **Board** (today's In Progress board, which already includes the Applied column), **Inbox** (today's Tracking Inbox; tab hidden in hosted mode) |
| 4 | Profile | `/profile`, `/profile/studio/:doc` | Sub-items: **About you**, **Document Studio** (tabs: Resume, Cover letter) |
| 5 | Settings | `/settings#<section>` | Existing groups plus new sections (below) |

The sidebar stays the existing slide-out `Sheet` in `components/layout.tsx`. Profile shows its two sub-items indented beneath it. Styling uses the existing theme tokens, so the Overview v3 theme can replace them later without touching nav code.

## What moves where

| Today | New home | Redirect |
|---|---|---|
| `/filtered`: removed-jobs list | Jobs › Filtered (`/jobs/filtered`) | `/filtered` → `/jobs/filtered` |
| `/filtered`: rules editor (`PrefilterRulesEditor`) | Settings › Search › Pre-score filter (`#prefilter`) | n/a |
| `/applications/in-progress` | Applications › Board (`/applications/board`) | `/applications/in-progress` → `/applications/board`. Existing redirects that pointed at in-progress (`/in-progress`, `/jobs/in_progress`, `/jobs/applied` handling) now point at `/applications/board` |
| `/tracking-inbox` | Applications › Inbox (`/applications/inbox`) | `/tracking-inbox` → `/applications/inbox`. Hosted mode: `/applications/inbox` → `/applications/board` |
| `/design-resume`, `/design-resume/:section` | Profile › Document Studio › Resume (`/profile/studio/resume`, `/profile/studio/resume/:section`) | both redirect, keeping `:section` |
| (new) | Profile › Document Studio › Cover letter (`/profile/studio/cover-letter`) | n/a |
| (new) | Profile › About you (`/profile`) | n/a |
| `/watchlist` | Settings › Search › Sources (`#sources`) | `/watchlist` → `/settings#sources` |
| `/visa-sponsors` | Settings › Search › Visa sponsors (`#visa-sponsors`) | `/visa-sponsors` → `/settings#visa-sponsors` |
| `/spend` | Settings › AI › Spend (`#spend`) | `/spend` → `/settings#spend` |
| `/tracer-links` (analytics page) | Settings › Integrations › Tracer links (`#tracer-links`): analytics shown under the existing setup section | `/tracer-links` → `/settings#tracer-links` |

New Settings group **Search** (placed after AI) holds: Sources, Pre-score filter, Scoring rules (the existing `scoring` section moves here from its own "Scoring" group), Visa sponsors. **Spend** joins the AI group after Prompt Templates.

## Key mechanism: `PageFrame` and embedding

The six moved pages (Watchlist, Visa Sponsors, Spend, Tracer Links, Tracking Inbox, In Progress board) and the Filtered list each render `<PageHeader …/>` + `<PageMain>`. They switch to one shared component:

```tsx
<PageFrame icon={Eye} title="Watchlist" subtitle="…" actions={…} mainClassName="…">
  …body…
</PageFrame>
```

- Default: renders exactly what it replaces (`PageHeader` + `PageMain`), so the page still works standalone.
- Inside `<EmbeddedPage>` (a context provider): renders a compact section header (h2, subtitle, actions on the right) and a plain `div` with `mainClassName`. There's no second app header and no nested `<main>`.

Settings, Applications and Profile wrap the pages they host in `<EmbeddedPage>`. The page component itself is reused, not copied.

**Settings save bar:** the new sections own their data and Save buttons, so they're not part of the settings form. `SECTION_FIELD_MAP` maps each new id to `[]`, so they never count as dirty. `getSectionBadge` returns `null` for them.

## Profile

- **About you** (`/profile`): read-only.
  - **Headline** from the design resume `basics.headline` (falls back to the name).
  - **Summary** from `summary.content`, as sanitized HTML rendered the same way Resume Studio previews it.
  - **Core strengths:** visible `sections.skills.items[].name`.
  - **Target roles:** the `searchTerms` setting.
  - **Location:** `basics.location`.
  - A banner: "Your documents are built from this page", with buttons to Resume and Cover letter.
  - Empty state when no design resume exists: "Import your resume in Document Studio", with a link.
  - No new API. It uses the existing design-resume and settings queries.
- **Document Studio** (`/profile/studio/:doc`): a header with a Resume / Cover letter segmented control.
  - **Resume:** today's `DesignResumePage`, embedded. Its internal links (`/design-resume/:section`) become `/profile/studio/resume/:section`. The base path is held in one constant, `RESUME_STUDIO_BASE`.
  - **Cover letter:**
    - **Your voice:** a read-only card with tone, formality and words-to-avoid from settings. It notes "Used for all AI writing: cover letters, chat and tailoring" and has an "Edit voice" link to `/settings#chat`. The form is not duplicated.
    - **Signature:** the signature upload/preview/remove UI, extracted from `CoverLetterPanel` into a shared `SignatureCard` used in both places. Hidden in hosted mode, since the API refuses it there.
    - A note that letters are written per job from each job's page.
    - A "recent letters" list is **out of scope**: `JobListItem` doesn't carry the letter text, so it needs a new API.

## Other link updates

- `OnboardingGate` allow-list: add `/profile/studio/resume` alongside `/design-resume`.
- `OnboardingPage` link to `/design-resume` → `/profile/studio/resume`.
- `AutomaticSourcePickerCard` link `/watchlist` → `/settings#sources`.
- `JobDetailPanel` "View in Progress Board" → navigate to `/applications/board` (label: "View on Applications board").
- Server analytics `urlPath` values (`/tracking-inbox`, `/tracer-links`) are event labels, not links. Leave them.

## Rollout (each step ships on its own, tests green)

1. **Foundations:** `PageFrame` + `EmbeddedPage`. Convert the seven page bodies to `PageFrame`. No visible change.
2. **Settings absorbs:** Sources, Pre-score filter, Visa sponsors, Spend, Tracer analytics. Add redirects and drop four sidebar items (Watchlist, Visa Sponsors, Spend, Tracer Links).
3. **Jobs › Filtered tab:** `/jobs/filtered` renders the Filtered list inside the Jobs page, with a link to the rules in Settings. Redirect `/filtered`. Drop the Filtered sidebar item.
4. **Applications:** the Applications page with Board and Inbox tabs. Redirects. The sidebar's "In Progress" and "Tracking Inbox" become one "Applications" item.
5. **Profile:** the Profile page with About you and Document Studio (Resume + Cover letter). `SignatureCard` extraction. Redirects. "Resume Studio" becomes "Profile" with sub-items. Final sidebar: 5 items.

## Testing

- `App.test.tsx`: one test per redirect in the table, plus hosted-mode Inbox → Board.
- A sidebar test in `components/navigation.test.ts`: the five items, in order; `isNavActive` for Profile on `/profile` and `/profile/studio/resume/basics`; Applications on `/applications/inbox`.
- `PageFrame` tests: standalone renders the page header; embedded renders an h2 and no `main`.
- Existing page tests keep passing (`WatchlistPage`, `VisaSponsorsPage`, `TracerLinksPage`, `FilteredJobsPage`, `TrackingInboxPage`, `InProgressBoardPage`, `SettingsPage`).
- After each step: a manual click-through on a dev server pointed at a **copy** of the database (see the local dev notes). Never the live Docker DB.
- Known unrelated failures: the two date-dependent tests in `ApplicationsPerDayChart.test.tsx`.

## Out of scope

- Profile strength score, skill map, role fit, story bank, pitch lengths, values, AI side panels (next spec).
- Recent cover letters list (needs an API).
- The Overview v3 redesign and the new visual theme.
- Changing what any moved page does.

## Coordination note for Overview v3

Its "Needs your action" tiles should link to `/jobs/ready`, `/jobs/discovered` and `/applications/inbox`. The sidebar list in that mockup is the old 11 items. Use the 5-item list above.

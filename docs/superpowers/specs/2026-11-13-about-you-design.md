# Profile › About you: design (phases 1 + 2, plus AI skill refresh)

**Status:** draft for approval · 2026-11-13
**Mockup:** "JobOps nav: Option A" canvas, board *Profile v2: brand home + Document Studio* (`ProfileHome.dc.html`). Use it for layout and copy only.
**Decisions:**
- Build insights (phase 1) and the saved profile (phase 2) together.
- The skill map uses a starter skill list plus an "AI refresh" button.
- All other AI drafting (pitch, stories, "catch me up", tailor, prep) is phase 3 and out of scope here.
**Built on:** the appearance system (theme tokens only, no hard-coded colours; the guard test enforces this) and the existing Overview pattern (`server/services/overview/{load,compute}.ts`).

## What the page shows (top to bottom)

1. **Brand banner.**
   - Content: initials, the brand line, and chips for target roles, location and industries.
   - Strength ring with "See how it's scored".
   - An Edit button opens the brand panel.
   - The brand line falls back to the resume headline when none is saved.
2. **Elevator pitch.**
   - A 15s / 30s / 60s switch shows each saved version.
   - "Built from" chips list the stories and values each version is linked to.
   - Edit opens the pitch panel.
   - Empty state: "Write your pitch". In phase 3 an AI draft button goes here.
3. **Skill map** (2×2).
   - Up axis: the share of your best-fit jobs that mention the skill.
   - Right axis: proof in your profile, as 0 / 1 / 2 / 3: listed only, used in a role or project, a bullet with a number, a saved story.
   - The four quarters are labelled "Lead with these", "Prove these", "Hidden strengths" and "Nice to have".
   - Plain-language axis labels plus a one-line explanation (as in the mockup).
   - Buttons: "Edit skills" (rename, hide, add keywords) and "Refresh with AI" (below).
4. **Roles that fit you.** Up to 4 cards.
   - Role families come from the titles of jobs the app has scored.
   - Each card shows a fit ring (average score of that family's jobs scoring 50 or more), a tag (Core fit / Step up / Adjacent / Stretch), why, gap, and "N open in your feed".
   - The CTA links to Jobs filtered by that family.
5. **Story bank.**
   - Theme tiles with counts (Delivery, Analytics, Customer, Leadership, Influence, Failure). An empty theme shows as a dashed gap.
   - The top 3 stories by result strength.
   - Add opens the story panel.
6. **What drives you.**
   - Value chips; starred values are emphasised.
   - Three ideal-role sliders: Startup ↔ Enterprise, Hands-on ↔ Managing, Remote ↔ In office.
   - Edit opens the values panel.
7. **How you're landing.** Three stat tiles:
   - applications sent and their average fit;
   - best fit so far;
   - a focus warning when a share of applications sits in low-fit role families.
8. **"Your documents are built from this page"** banner (exists today).

**The strength breakdown** opens from the ring: six checks with points, each with a fix button.
- Basics: 10
- Results in experience: 20
- Proof for in-demand skills: 25
- Story coverage: 20
- Pitch and values: 10
- Fresh: 15

Check rules are in *Compute* below.

**Side panels.** Each panel is a Sheet from the right, keyboard-accessible.
- Brand: brand line, target roles (read-only; links to the search terms editor) and industries.
- Pitch: the three text areas, plus a story picker for "built from".
- Story: title, themes (multi-select), S/T/A/R text areas, result metric. Also delete.
- Values: chips with star toggles, plus the three sliders.
- Skills: rename, hide or add skills and their keywords.

## Data

**New table `profile_entries`** (one row per item, scoped by tenant and user like other private data):
```
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT, kind TEXT NOT NULL,
data TEXT NOT NULL (JSON), created_at TEXT, updated_at TEXT
```
- `kind` is one of `brand` | `pitch` | `values` | `story` | `skills`.
  - `brand`, `pitch`, `values` and `skills` are singletons.
  - `story` can have many rows.
- JSON shapes, validated with Zod in `shared/src/types/profile.ts`:
  - `brand`: `{ line: string; industries: string[] }`
  - `pitch`: `{ s15: string; s30: string; s60: string; builtFrom: { storyIds: string[]; values: string[] } }`
  - `values`: `{ items: { label: string; starred: boolean }[]; ideal: { size: number; management: number; office: number } }`. Sliders run 0–100.
  - `story`: `{ title: string; themes: Theme[]; situation: string; task: string; action: string; result: string; metric: string | null; source: "manual" }`
  - `skills`: `{ items: { id: string; label: string; keywords: string[]; hidden: boolean; source: "starter" | "ai" | "user" }[]; refreshedAt: string | null }`
- The migration is a `CREATE TABLE IF NOT EXISTS` in `server/db/migrate.ts`, plus a Drizzle schema entry. It is additive only.

**Existing data read:**
- the design resume: basics, summary, experience bullets, projects, skills;
- settings: `searchTerms`;
- jobs: title, status, suitability score, description, stage events.

## Server

`server/services/profile/` follows the Overview's split:
- **`load.ts`** reads the resume, settings, jobs and profile entries for the current user/tenant (same scoping helper as Overview).
- **`compute.ts`** is pure and unit-tested. It produces `ProfileInsightsResponse`:
  - **Best-fit jobs:** applied, or suitability score ≥ 50, with a description over 300 characters. Falls back to all scored jobs if there are fewer than 10.
  - **Skill demand:** share of best-fit jobs whose description matches any of the skill's keywords (case-insensitive, whole word).
  - **Skill proof:**
    - 3 if a saved story mentions it;
    - else 2 if a resume bullet mentions it *and* contains a number;
    - else 1 if mentioned in an experience or project bullet;
    - else 0.5 if only in Core strengths;
    - else 0.
  - **Role families:** group job titles by keyword families. Product Manager/Owner, Strategy & Operations, Product Operations, Growth/GTM, Customer Success/CX, Analytics, Program/Project, and Other. Each family gets: job count, average score, count scoring 65 or more, applied count, and top skills demanded.
    - Tag: Core fit when avg ≥ 65 and ≥ 3 jobs score 65+; Step up when avg ≥ 55 and many jobs; Adjacent when avg ≥ 60 and few jobs; Stretch otherwise.
    - Why and gap are templated from the family's top demanded skills against your proof levels (no AI).
  - **Landing stats:** applications count and average fit; best fit (job title and employer); share of applications in families averaging under 45.
  - **Strength checks:**

    | Check | Points | Rule |
    |---|---|---|
    | Basics | 10 | name, location, email, LinkedIn: 2 each; brand line or headline aimed at a target role: 2 |
    | Results | 20 | 20 × the share of experience bullets containing a number. Roles with no bullets count as 0 bullets but are listed as gaps. |
    | Proof | 25 | across skills demanded by ≥ 40% of best-fit jobs: mean of min(proof, 2) ÷ 2 × 25 |
    | Story coverage | 20 | 6 themes; each theme with ≥ 1 saved story gives 20/6 |
    | Pitch and values | 10 | each pitch length 2; ≥ 3 values 2; ideal sliders saved 2 |
    | Fresh | 15 | 15 if the resume or any profile entry was updated within 60 days; 8 within 120 days; else 0 |

    Each failing check returns a short fix message and an action id (`edit-resume`, `add-story`, `edit-pitch`, `edit-values`, `edit-brand`).
- **Routes**, added to the existing `profileRouter` (`/api/profile/...`):
  - `GET /insights` returns `ProfileInsightsResponse`.
  - `GET /entries` returns all profile entries.
  - `PUT /entries/:kind` upserts a singleton.
  - `POST /stories`, `PUT /stories/:id` and `DELETE /stories/:id`.
  - `POST /skills/refresh` (AI) sends up to 40 best-fit job descriptions, trimmed, plus the current skill list to the LLM using the existing `createConfiguredLlmService("scoring")` + `jsonSchema` pattern. It returns up to 20 skills with keywords and merges them into `skills` with `source: "ai"`. User-renamed and hidden items are kept. Usage is recorded through the existing LLM usage tracking, so it appears in Spend. It runs only on click, never automatically.
  - All routes respect tenant/user scoping and return 400 on Zod validation failure.
- **Starter skills** live in `shared/src/profile/starter-skills.ts`. The 16 groups and keywords used for the earlier 63/100 analysis: cross-functional alignment, roadmap & prioritization, AI/ML, executive communication, go-to-market & launches, technical fluency, KPIs & OKRs, customer research, people leadership, SQL & data analysis, agile delivery, business cases & sizing, SaaS/B2B, pricing & monetization, experimentation, financial modelling. A user's saved `skills` entry replaces the starter list once it exists.

## Client

- `pages/profile/AboutYouPage.tsx` becomes a composition of focused cards in `pages/profile/about/`: `BrandBanner`, `StrengthRing` + `StrengthSheet`, `PitchCard`, `SkillMapCard`, `RolesCard`, `StoryBankCard`, `ValuesCard`, `LandingCard`, and the panels (`BrandSheet`, `PitchSheet`, `StorySheet`, `ValuesSheet`, `SkillsSheet`).
- Data comes from TanStack Query (`queryKeys.profile.insights()`, `queryKeys.profile.entries()`). Mutations invalidate both.
- Use theme tokens and the existing `Card`, `Sheet`, `Button` and `Badge` components.
  - The skill-map plot uses CSS positioning, no chart library, with `--bucket-*`-style fixed colours for the quarters via new semantic tokens only if needed. Prefer existing `--success`, `--warning`, `--info` and `--muted`.
  - Headings use `font-heading` and `--heading-weight`.
- Accessibility:
  - The skill map has an equivalent list ("Skills to prove next: …") for screen readers.
  - The ring has `role="img"` with an aria-label.
  - Sliders are real `input type=range` with labels.
- Empty states:
  - No resume: point to Document Studio (exists).
  - Fewer than 5 scored jobs: the skill map and roles say "Too early. These fill in after your first searches", with no fake data.

## Testing

- `compute.test.ts`:
  - each strength check;
  - skill demand and proof levels;
  - role-family grouping and tags;
  - landing stats;
  - empty and low-data cases.
- Route tests: entries CRUD, validation errors, tenant scoping, and skills refresh with a mocked LLM (merge rules, and usage recorded).
- Client tests: each card renders from fixture insights; each panel saves through its mutation; the strength sheet lists the checks.
- The no-hard-coded-colours guard and the appearance contrast tests stay green.

## Out of scope (phase 3)

AI drafting of pitches and stories, seeding stories from resume bullets, "catch me up", tailoring the pitch to a job, interview prep, and the "Ask AI to" chip row. Phase 3 will add these into the same panels.

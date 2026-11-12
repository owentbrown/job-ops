# Overview page redesign

Rebuild **only the Overview (home dashboard)** of the existing JobOps app to match `reference/OverviewV3.dc.html`, on top of the theme system in `THEMING.md`. The reference file is design-tool source (open it as text for structure, copy, and the sample/real data logic). Rebuild with the app's own framework, components and data layer. Don't change other pages yet.

Plan first: read the current Overview, list which data exists and which doesn't (see "Data needs"), propose the plan, then build.

## Page structure (top to bottom)
**Header:** "Overview" title, range selector (7d / 14d / 30d / 90d) affecting Pace, Replies and Insights (not the pipeline snapshot), and the sun/moon quick toggle (see THEMING.md).

### 01 Pipeline
One card: big total ("48 applications"), one segmented status bar, and a legend with count + % per status.
Five statuses in fixed order: Awaiting reply, Screening, Interview, Offer, Rejected. ("Awaiting reply" replaces the old separate Waiting / No reply, which meant the same thing.) Segment widths proportional; hide zero-count segments; min width ~8-10px. Bar has an aria-label listing counts.
Do NOT add aging, "waiting on a reply" timelines or follow-up nudges: the user doesn't follow up with employers.

### 02 Needs your action (tile-based)
Four big, easy-to-read tiles (wrap on narrow screens): each has a small label, one huge number or short headline, and one link/button.
1. **Solve browser check**: amber, "Blocking your search", names the board (e.g. Hiring Cafe), "Solve" button. Only shown when a search is blocked by a browser check.
2. **N jobs to review** -> Jobs > Ready.
3. **N new jobs discovered** -> Jobs > Discovered.
4. **N emails to match or confirm** -> Tracking Inbox.
Tiles with nothing to do show 0 and calm styling rather than disappearing (except the browser check).
Below the tiles, a slim one-line status strip: "Search engine · Daily 8:00 AM · Last run 180 / 180 searches · 446 results · 419 unique · 742 all jobs".
Tile visual treatment depends on the theme (outlined cards / joined grid / filled tints): see THEMING.md section 6.

### 03 Insights
- **Pace:** per-day applications bar chart for the range + stats: average per day, best day, found -> applied time.
- **Replies:** 3 tiles: Response rate (x of y applications), Median time to response, Emails matched.
- **Response rate by role:** horizontal bars ("7 of 18 · 39%") + a focus-check note when some applications fall outside target roles.
- **Why you skip:** horizontal bars of skip reasons + "Skipped but scored 80+" list with a Reconsider action per row.
- **Source yield:** per job board table: results, applied, replied, reply rate.
- **Does the match score predict replies?** reply rate by score band (Below 70, 70-79, 80-89, 90+) + one-line takeaway.
Each number appears in exactly one place; don't repeat metrics across sections.

## Empty / low-data states
With little data (e.g. 12 applied, no replies) the pipeline still renders; Replies tiles show "—" with "Too early to read. These fill in after your first reply."; breakdowns show "—" and a hint of when they'll appear. Never draw zero-percent bars that imply a result.

## Sidebar
Neutral by default; locked open on wide screens with a Collapse button; drawer on narrow screens. Hide the "Tracer Links" item for now (feature not in use). Add the Appearance button in the footer (THEMING.md).

## Data needs (check what exists; add only what's missing)
- Application status (map existing statuses to the 5 buckets)
- Applied date, found date
- Counts: Ready, Discovered, All jobs; last-run stats from the search engine
- Browser-check-blocked state + which source
- Emails awaiting match/confirm (Tracking Inbox) and emails matched
- First-reply timestamp per application
- Role tag per application + a target-roles setting
- Skip reason per skipped job + match score
- Source per job
If a field doesn't exist, build the card's empty state and list the gap in your plan rather than inventing data.

## Out of scope
Tracer link opens, follow-up tracking, goals, company logos/avatars, other pages (later, per THEMING.md rollout step 5).

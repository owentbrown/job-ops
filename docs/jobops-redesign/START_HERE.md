# JobOps redesign: start here

Files in this folder:
- `THEMING.md`: the appearance feature (Light/Dark/System, 3 themes, 6 colour pairs, switcher placement, tokens, rollout, acceptance). **Do this first.**
- `OVERVIEW_REDESIGN.md`: the new Overview page spec, built on the theme system.
- `reference/ThemeSwitcher.dc.html`: interactive demo source. Read its script block for exact `THEMES`, `ACC` and `tok()` logic, and the popover/sidebar/tile structure.
- `reference/OverviewV3.dc.html`: Overview mockup source (sample vs real data logic, tile copy).
The `.dc.html` files are from a design tool and aren't runnable standalone. Treat them as readable specs, not code to copy. If screenshots of the designs are added to `reference/`, prefer them for visuals.

## Suggested first message to Claude Code
> Read START_HERE.md, THEMING.md and OVERVIEW_REDESIGN.md in docs/jobops-redesign/, and skim the files in reference/. Inspect how the app is styled today, then give me a short plan for (1) the theme token layer + Appearance switcher, then (2) the new Overview page. Wait for my OK before large refactors. Keep other pages working during migration.

## Setup
Copy this folder into the app repo (e.g. `docs/jobops-redesign/`) and add one line to the repo's CLAUDE.md: "UI redesign in progress: see docs/jobops-redesign/START_HERE.md; use theme tokens, no hard-coded colours."

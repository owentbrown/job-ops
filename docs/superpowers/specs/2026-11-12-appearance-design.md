# Appearance system: design for this app

**Status:** approved · 2026-11-12
**Source of truth for values:** `docs/jobops-redesign/THEMING.md` and the script block of `docs/jobops-redesign/reference/ThemeSwitcher.dc.html` (`THEMES`, `ACC`, `STAT`, `mix()`, `tok()`). The `.dc.html` files are design-tool source: read them for values and logic, never copy their markup.
**Decisions:**
- First load is System mode, Editorial theme, Evergreen colours. The app today is hard-locked to dark (`<html class="dark">`), so this is a visible change.
- "No hard-coded colours" is enforced by a test, not by a note in CLAUDE.md.

## How the app is styled today

- Tailwind v4 with shadcn-style CSS variables in `orchestrator/src/index.css`: a `:root` block, a `.dark` block and an `@theme inline` mapping.
- The variables include `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`, the `--sidebar*` set, the `--bucket-*` pipeline colours, `--heading-font`, `--font-sans` and `--font-mono`.
- The `dark:` variant is `@custom-variant dark (&:is(.dark *))`.
- Components almost entirely use these variables. About 25 hard-coded hex values remain, in 5 client files.
- Fonts today: Geist (sans) and IBM Plex Mono.

## Architecture

1. **One TypeScript source of truth** lives in `orchestrator/src/client/lib/appearance/`:
   - `tokens.ts` holds `THEMES`, `COLOUR_PAIRS` and `STATUS` copied exactly from the reference, plus `mix(a, b, k)` (the same linear blend as the reference) and `buildTokens(theme, colours, mode)`. `buildTokens` returns the reference `tok()` output mapped to app variable names (table below).
   - `types.ts` holds `Mode = "light" | "dark" | "system"`, `ThemeId`, `ColourId` and the `AppearanceChoice` type.
2. **Generated CSS.** A script, `orchestrator/scripts/generate-appearance-css.ts` (run with `tsx`), writes `orchestrator/src/styles/appearance.generated.css`.
   - It contains one block per combination: `html[data-theme="…"][data-colours="…"][data-mode="…"] { --var: value; … }`, 36 in all.
   - A test fails if the committed file differs from the generator's output, so the two can't drift.
   - `index.css` imports it after `:root` and `.dark`, so the generated values win whenever the attributes are present. With no attributes, the old blocks still apply as a neutral fallback.
3. **Attributes on `<html>`:** `data-mode` (resolved to `light` or `dark`, never `system`), `data-theme` and `data-colours`. The `.dark` class stays in step with `data-mode`, so existing `dark:` utilities keep working.
4. **No flash on load.** A tiny inline script in `orchestrator/index.html` `<head>` reads `localStorage["jobops.appearance"]`, resolves System with `matchMedia`, and sets the three attributes and `.dark` before first paint.
   - Its default is `{mode: "system", theme: "editorial", colours: "evergreen"}`.
   - It replaces the hard-coded `class="dark"`.
5. **Runtime state.** An `AppearanceProvider` / `useAppearance()` hook (`lib/appearance/AppearanceProvider.tsx`):
   - It exposes `choice`, `resolvedMode`, `setMode`, `setTheme`, `setColours` and `toggleLightDark`.
   - It writes to localStorage and the `<html>` attributes.
   - It listens to `prefers-color-scheme` changes live when mode is System.
   - It persists per browser. Server-side per-user storage is out of scope for now.
6. **Fonts.** Load Newsreader (Editorial headings; replaces the reference Instrument Serif at the user's request), Inter, JetBrains Mono, IBM Plex Sans, IBM Plex Mono and DM Sans from Google Fonts in `index.html`, where `preconnect` already exists. Each theme sets `--font-sans`, `--font-mono`, `--heading-font` and `--heading-weight`.

## Variable mapping (`buildTokens` output → CSS variable)

| reference | app variable(s) |
|---|---|
| bg | `--background` |
| ink | `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` |
| surf | `--card`, `--popover` |
| mut | `--muted-foreground` |
| line | `--border`, `--input` |
| track | `--muted` |
| tint / tint2 | `--accent`, `--secondary` (and new `--tint`, `--tint-2`) |
| acc / accInk | `--primary` / `--primary-foreground`, `--ring`, new `--action` |
| accBright | new `--action-bright` |
| nav | new `--nav` |
| side, sideInk, navOnBg, navOnInk, navBar, sideBorder, brandInk | `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-primary`, `--sidebar-border`, new `--sidebar-brand` |
| STAT (5) | `--bucket-awaiting`, `--bucket-screening`, `--bucket-interview`, `--bucket-offer`, `--bucket-rejected`. Map onto whatever bucket variable names the app uses now; check `index.css`. |
| warning / danger | `--warning-bg`, `--warning-fg`, `--warning-border`, `--warning-dot`, `--danger-bg`, `--danger-fg`, `--danger-border`; `--destructive` = danger fg |
| hf/hw, bf, mf | `--heading-font`, `--heading-weight`, `--font-sans`, `--font-mono` |
| r, tileR, btnR, pillR, popR, navR, navH | `--radius` (cards), `--radius-tile`, `--radius-button`, `--radius-pill`, `--radius-popover`, `--radius-nav`, `--nav-item-height` |
| pad | `--density-pad` |
| shadow / borders | `--card-shadow`, `--card-border-width` |
| pipeline bar | `--bar-height`, `--bar-gap`, `--bar-radius` |
| action tiles | `--tile-min-height`, `--tile-number-size` |

Theme structure the variables can't express goes in theme-scoped CSS: `html[data-theme="ledger"] …`.
- Sidebar style: dark column, light panel or floating card.
- Action tiles: separate cards, one joined grid, or filled with tints.

## Quality gates (tests)

- **Contrast.** For all 36 combinations, compute WCAG contrast from the hex values:
  - ink on bg and on surf: ≥ 4.5
  - mut on surf: ≥ 4.5
  - accInk on acc: ≥ 4.5
  - sideInk on side: ≥ 4.5
  - If one fails, adjust the action colour (or the derived value) in `tokens.ts` and record why in a comment.
- **Generated CSS is current.** The generator's output equals the committed file.
- **No hard-coded colours.** Fail on `#rgb`/`#rrggbb`/`rgb(`/`hsl(` literals in `orchestrator/src/client/**/*.{ts,tsx}`, with an explicit allowlist: the appearance token module, tests, and any justified exceptions with a reason. Migrate the existing ~25 literals to variables where sensible.

## UI

- **The sidebar Appearance button** opens a ~330px popover with:
  - a Mode segmented control (Light / Dark / System);
  - three Theme cards, each with a mini preview of its sidebar and tile style;
  - six two-half colour swatches;
  - a link: "All settings live in Settings → Appearance".
  The subtitle under the button reads e.g. "Editorial · Evergreen · System". The popover traps focus and closes on Esc. Options use `aria-pressed`, and swatches have accessible names ("Evergreen: sidebar teal, actions coral"). On the mobile Sheet the button sits at the bottom of the drawer.
- **The page header** gets a sun/moon quick toggle, top-right on every page. It sets the mode explicitly to light or dark.
- **Settings → Appearance** is a new section in the Display group, deep link `#appearance`. It has the same controls, larger previews and a one-line explanation of System mode. Mark it embedded (no Save bar), since changes apply instantly.

## Rollout (one branch: `appearance`)

1. Token engine, generated CSS, contrast, drift and no-hex tests.
2. Runtime: the init script, provider, `.dark` sync, fonts, and wiring the generated CSS into `index.css`.
3. Structure: sidebar styles, card/button/pill radius, shadow and density driven by variables.
4. UI: popover, header toggle, Settings → Appearance.
5. Overview: tile styles and pipeline bar per theme, from the variables.

Pages not yet migrated keep working because every component already uses the shared variables.

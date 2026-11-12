# Appearance feature + design system

Build a theme system for the whole app and an Appearance control. Source of truth for exact values is `reference/ThemeSwitcher.dc.html` (read the `THEMES`, `ACC` and `tok()` code in its script block). The `.dc.html` files are design-tool source, **not runnable code**. Read them for values and logic; don't copy markup.

## 1. User-facing options
- **Mode:** Light / Dark / System (default System; follows `prefers-color-scheme`, live-updates when the OS changes).
- **Theme (3):** Editorial (default), Ledger, Soft.
- **Colours (6 pairs):** each is a pair of colours shown as a two-half circle swatch: left half = **sidebar/surface colour**, right half = **action colour** (buttons, links, chart bars, focus rings).
  Evergreen (default), Harbour, Twilight, Clay, Orchid, Slate.
- 3 themes x 2 modes x 6 colour pairs = 36 looks from one token set.
- Persist per user (localStorage for instant apply; also save to the user profile/Firestore if the app has user settings). Apply before first paint (tiny inline script in `<head>` setting `data-mode`, `data-theme`, `data-colours`) to avoid a flash.

## 2. Where the control lives
1. **Sidebar footer "Appearance" button** (above Collapse), subtitle shows e.g. "Editorial · Evergreen · System". Opens a popover (~330px) with: Mode segmented control, Theme cards (mini preview incl. sidebar and tile style), Colours swatches, and a link "All settings live in Settings -> Appearance". Collapsed sidebar: icon only. Narrow screens: bottom of the drawer.
2. **Sun/moon quick toggle** at the top-right of every page header; flips light/dark (sets mode explicitly).
3. **Settings -> Appearance** page: same controls, larger theme previews, explanation of System mode.
Popover needs focus trap, Esc to close, `aria-pressed` on options, swatches need accessible names ("Evergreen: sidebar teal, actions coral").

## 3. Architecture
- CSS variables on `<html>` driven by `data-mode="light|dark"` (resolved from System), `data-theme="editorial|ledger|soft"`, `data-colours="evergreen|..."`.
- Components use only variables (no hard-coded colours). Adding a theme/colour pair later = one token block.
- Derived colours: implement a `mix(a, b, k)` (linear sRGB-ish blend of hex colours) at build time or via CSS `color-mix(in srgb, ...)`.

## 4. Neutral tokens per theme x mode
| token | Editorial L | Editorial D | Ledger L | Ledger D | Soft L | Soft D |
|---|---|---|---|---|---|---|
| bg (before tint) | #F5F3EE | #151412 | #F1F4F8 | #0E1218 | #F4F1FB | #12101C |
| surface | #FFFFFF | #1E1C19 | #FFFFFF | #151B24 | #FFFFFF | #1B182A |
| ink | #151A21 | #F2EEE6 | #10233F | #E8ECF2 | #241B3D | #EEEAFB |
| muted | #5E6670 | #A8A196 | #4C5B70 | #9AA5B5 | #5F5877 | #A59FBF |
| line | #E4E0D6 | #33302A | #CDD5E0 | #27303C | #E4DEF5 | #2D2842 |
| track | #ECE8DE | #33302A | #DCE3ED | #27303C | #E9E3F8 | #2D2842 |

## 5. Colour pairs (nav = sidebar/surface colour, action = CTA colour)
| name | nav L | nav D | action L | action D |
|---|---|---|---|---|
| Evergreen | #0E5E54 | #5FD3BC | #C2531F | #F59A6B |
| Harbour | #12305C | #8DB4F0 | #0F766E | #5FD3BC |
| Twilight | #3B2F8F | #A5A0FF | #BE1E5A | #FF8FB5 |
| Clay | #8A3A12 | #F59A6B | #0F6E7A | #6FD0DC |
| Orchid | #5B3BC4 | #B9A6FF | #0E7490 | #67E8F9 |
| Slate | #1F2A44 | #9AA8C7 | #4F46E5 | #A5A0FF |
Text on action fill: #FFFFFF in light, #0B0C14 in dark. Verify >= 4.5:1 for every pair; adjust the action colour if one fails.

**Big-surface derivation (the colour pair must change more than buttons):**
- page bg = mix(neutral bg, nav, k). k light/dark: Editorial 0.04/0.07, Ledger 0.03/0.05, Soft 0.09/0.10.
- tint (soft fills) = mix(surface, nav, 0.10 light / 0.16 dark); tint2 = 0.05 / 0.09.
- Sidebar by theme (see section 6).

## 6. What differs between themes (structure, not just fonts)
| | Editorial | Ledger | Soft |
|---|---|---|---|
| Type | Instrument Serif titles (400), Inter body, JetBrains Mono numbers | IBM Plex Sans (headings 600) + IBM Plex Mono, uppercase tracked labels | DM Sans (700 headings and big numbers), sentence-case labels |
| Radius | cards 14, tiles 18, buttons 10, pills 8 | 4 everywhere, pills 2 | cards/tiles 28, buttons/nav/pills fully round |
| Shadow | none, hairline borders | none, hairline borders | `0 8px 28px rgba(36,27,61,.09)`, no borders on cards |
| Sidebar | full-height dark column: light mode mix(nav, #0A0F12, 0.6); dark mode mix(#0A0A0A, nav, 0.12); 236px; active row = white 10% + 2px inset bar in action-bright | full-height **light** panel with right divider: light mix(#FFF, nav, 0.05); dark mix(bg, nav, 0.05); active row = nav tint bg + action-coloured text and 2px bar; nav item height 34 | **floating** rounded card (32px radius, 14px margin, 220px): light mix(nav, #000, 0.18); dark mix(#1B182A, nav, 0.28); active = white 20% pill |
| Action tiles | separate outlined cards, min-height 190, number 52px | **one joined grid**: container bg = line colour, 1px gap, 4px radius, tiles square, min-height 150, number 40px | filled with nav tints (light k 0.16/0.09/0.03, dark 0.26/0.16/0.08), no outline, min-height 200, number 56px |
| Pipeline bar | 28px tall, 4px gaps, 6px segment radius | 14px tall, 1px gaps, 2px radius | 20px tall, 4px gaps, fully round |
| Density | padding 24 | padding 18 (compact) | padding 28 |
The browser-check tile stays amber in every theme.

## 7. Fixed semantic colours (never change with the colour pair)
- Pipeline statuses light: Awaiting #CFC9BA, Screening #9FD0C4, Interview #3F9A8B, Offer #0E5E54, Rejected #D9A4A4. Dark: #6B665A, #4F8F82, #5FBFAB, #8EE3CF, #B9696A.
- Warning (amber): light bg #FFF4DD, text #8A5200, border #F0D9A5, dot #D9922B; dark bg #3A2A08, text #FFC76B, border #6B4C14.
- Danger: light bg #FBEDED, text #A12B2B, border #E3B4B4; dark bg #3A1616, text #FF9B9B, border #6B2A2A.
Statuses must never rely on colour alone (labels/counts always present).

## 8. Rollout plan (suggested)
1. Inspect the app's current styling approach (CSS modules, Tailwind, etc.) and propose how tokens map onto it. Plan first, wait for approval if it's a big refactor.
2. Add the token layer + `data-` attribute plumbing + no-flash init script.
3. Migrate shared components (sidebar/shell, buttons, pills, cards, tables, progress bars) to variables; add theme-specific structural variants (sidebar style, tile style, bar style) via variables or theme-scoped classes.
4. Build the Appearance popover, header quick toggle and Settings -> Appearance page.
5. Rebuild the Overview page (see `OVERVIEW_REDESIGN.md`) on the new system, then migrate remaining pages (Discover, In Progress, Job detail, Spend) screen by screen.

## 9. Acceptance
- All 36 combinations render without unreadable text; contrast >= 4.5:1 for body text and action fills.
- Switching is instant, persists across reloads, no flash on load.
- System mode follows OS changes live.
- Switcher reachable from every page via sidebar footer and header toggle.
- Existing pages not yet migrated still work (use a neutral fallback) during the rollout.

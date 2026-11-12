/**
 * Appearance system types.
 *
 * The user picks a mode (light / dark / system), a theme (structure + type)
 * and a colour pair (sidebar colour + action colour). 3 themes x 2 resolved
 * modes x 6 colour pairs = 36 looks. See
 * docs/superpowers/specs/2026-11-12-appearance-design.md.
 */

export const MODES = ["light", "dark", "system"] as const;
export type Mode = (typeof MODES)[number];

/** A mode after System has been resolved against `prefers-color-scheme`. */
export type ResolvedMode = Exclude<Mode, "system">;
export const RESOLVED_MODES = [
  "light",
  "dark",
] as const satisfies readonly ResolvedMode[];

export const THEME_IDS = ["editorial", "ledger", "soft"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const COLOUR_IDS = [
  "evergreen",
  "harbour",
  "twilight",
  "clay",
  "orchid",
  "slate",
] as const;
export type ColourId = (typeof COLOUR_IDS)[number];

export interface AppearanceChoice {
  mode: Mode;
  theme: ThemeId;
  colours: ColourId;
}

export const DEFAULT_APPEARANCE: AppearanceChoice = {
  mode: "system",
  theme: "editorial",
  colours: "evergreen",
};

/** localStorage key. The inline init script in index.html reads the same key. */
export const APPEARANCE_STORAGE_KEY = "jobops.appearance";

/** Neutral palette for one theme in one mode (bg is before the colour tint). */
export interface NeutralPalette {
  bg: string;
  surf: string;
  ink: string;
  mut: string;
  line: string;
  track: string;
}

export type SidebarStyle = "dark" | "light" | "float";
export type TileStyle = "outline" | "grid" | "filled";

/**
 * One theme, field for field as the reference `THEMES` entry
 * (docs/jobops-redesign/reference/ThemeSwitcher.dc.html). Sizes are px.
 */
export interface ThemeDefinition {
  name: string;
  /** Heading font stack and weight. */
  hf: string;
  hw: number;
  /** Section heading size. */
  hs: number;
  /** Body font stack. */
  bf: string;
  /** Mono / numbers font stack. */
  mf: string;
  /** Card radius. */
  r: number;
  tileR: number;
  btnR: number;
  pillR: number;
  popR: number;
  navR: number;
  /** Sidebar nav item height. */
  navH: number;
  /** Card padding (density). */
  pad: number;
  /** Action tile min height, number size and weight. */
  tileH: number;
  tileNum: number;
  tileNumW: number;
  sideStyle: SidebarStyle;
  tileStyle: TileStyle;
  cardBorder: boolean;
  shadow: string;
  /** Pipeline bar height, gap and segment radius. */
  barH: number;
  barGap: number;
  barR: number;
  /** Page-bg tint strength toward the nav colour: [light, dark]. */
  bgK: readonly [number, number];
  /** Uppercase tracked labels (true) or sentence-case accent labels. */
  labelCase: boolean;
  /** Page title size. */
  h1s: number;
  L: NeutralPalette;
  D: NeutralPalette;
}

/** A colour pair: nav = sidebar/surface colour, action = CTA colour. */
export interface ColourPair {
  id: ColourId;
  name: string;
  /** Plain-language names for accessible swatch labels. */
  navName: string;
  actionName: string;
  navLight: string;
  navDark: string;
  actionLight: string;
  actionDark: string;
}

/** Output of `resolveTokens` (the reference `tok()`), before CSS naming. */
export interface ResolvedTokens {
  theme: ThemeDefinition;
  mode: ResolvedMode;
  bg: string;
  surf: string;
  ink: string;
  mut: string;
  line: string;
  track: string;
  nav: string;
  acc: string;
  accBright: string;
  accInk: string;
  tint: string;
  tint2: string;
  pillBg: string;
  pillFg: string;
  amb: string;
  warnLine: string;
  dBg: string;
  dFg: string;
  dLine: string;
  /** awaiting, screening, interview, offer, rejected */
  st: readonly [string, string, string, string, string];
  side: string;
  sideInk: string;
  brandInk: string;
  navOnBg: string;
  navOnInk: string;
  navBar: string;
  sbBg: string;
  sbBorder: string;
  sbInk: string;
  sbSub: string;
  /** Sidebar divider colour; "transparent" when the reference has `none`. */
  sideBorderColour: string;
  sideBorderWidth: string;
  /**
   * Focus ring on the sidebar (not in the reference). Derived so it reaches
   * 3:1 against `side` (WCAG 1.4.11 non-text contrast).
   */
  sideRing: string;
}

/**
 * Appearance token engine: the single source of truth for theme colours and
 * structure. Values are copied from the script block of
 * docs/jobops-redesign/reference/ThemeSwitcher.dc.html (THEMES, ACC, STAT,
 * mix(), tok()). `scripts/generate-appearance-css.ts` turns `buildTokens()`
 * into src/styles/appearance.generated.css.
 *
 * Any deviation from the reference is marked "ADJUSTED" with the reason.
 */

import { contrastRatio } from "./contrast";
import type {
  ColourId,
  ColourPair,
  ResolvedMode,
  ResolvedTokens,
  ThemeDefinition,
  ThemeId,
} from "./types";

const hexChannels = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/**
 * Linear per-channel blend of two `#rrggbb` colours: k=0 gives `a`, k=1 gives
 * `b`. Same arithmetic and rounding as the reference `mix()`; returns
 * lowercase `#rrggbb`.
 */
export function mix(a: string, b: string, k: number): string {
  const x = hexChannels(a);
  const y = hexChannels(b);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(x[i] * (1 - k) + y[i] * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  editorial: {
    name: "Editorial",
    hf: "'Instrument Serif', Georgia, serif",
    hw: 400,
    hs: 32,
    bf: "Inter, sans-serif",
    mf: "'JetBrains Mono', monospace",
    r: 14,
    tileR: 18,
    btnR: 10,
    pillR: 8,
    popR: 16,
    navR: 8,
    navH: 38,
    pad: 24,
    tileH: 190,
    tileNum: 52,
    tileNumW: 500,
    sideStyle: "dark",
    tileStyle: "outline",
    cardBorder: true,
    shadow: "none",
    barH: 28,
    barGap: 4,
    barR: 6,
    bgK: [0.04, 0.07],
    labelCase: true,
    h1s: 42,
    L: {
      bg: "#F5F3EE",
      surf: "#FFFFFF",
      ink: "#151A21",
      mut: "#5E6670",
      line: "#E4E0D6",
      track: "#ECE8DE",
    },
    D: {
      bg: "#151412",
      surf: "#1E1C19",
      ink: "#F2EEE6",
      mut: "#A8A196",
      line: "#33302A",
      track: "#33302A",
    },
  },
  ledger: {
    name: "Ledger",
    hf: "'IBM Plex Sans', sans-serif",
    hw: 600,
    hs: 24,
    bf: "'IBM Plex Sans', sans-serif",
    mf: "'IBM Plex Mono', monospace",
    r: 4,
    tileR: 4,
    btnR: 4,
    pillR: 2,
    popR: 6,
    navR: 4,
    navH: 34,
    pad: 18,
    tileH: 150,
    tileNum: 40,
    tileNumW: 500,
    sideStyle: "light",
    tileStyle: "grid",
    cardBorder: true,
    shadow: "none",
    barH: 14,
    barGap: 1,
    barR: 2,
    bgK: [0.03, 0.05],
    labelCase: true,
    h1s: 28,
    L: {
      bg: "#F1F4F8",
      surf: "#FFFFFF",
      ink: "#10233F",
      mut: "#4C5B70",
      line: "#CDD5E0",
      track: "#DCE3ED",
    },
    D: {
      bg: "#0E1218",
      surf: "#151B24",
      ink: "#E8ECF2",
      mut: "#9AA5B5",
      line: "#27303C",
      track: "#27303C",
    },
  },
  soft: {
    name: "Soft",
    hf: "'DM Sans', sans-serif",
    hw: 700,
    hs: 28,
    bf: "'DM Sans', sans-serif",
    mf: "'DM Sans', sans-serif",
    r: 28,
    tileR: 28,
    btnR: 999,
    pillR: 999,
    popR: 24,
    navR: 999,
    navH: 42,
    pad: 28,
    tileH: 200,
    tileNum: 56,
    tileNumW: 700,
    sideStyle: "float",
    tileStyle: "filled",
    cardBorder: false,
    shadow: "0 8px 28px rgba(36,27,61,0.09)",
    barH: 20,
    barGap: 4,
    barR: 999,
    bgK: [0.09, 0.1],
    labelCase: false,
    h1s: 36,
    L: {
      bg: "#F4F1FB",
      surf: "#FFFFFF",
      ink: "#241B3D",
      mut: "#5F5877",
      line: "#E4DEF5",
      track: "#E9E3F8",
    },
    D: {
      bg: "#12101C",
      surf: "#1B182A",
      ink: "#EEEAFB",
      mut: "#A59FBF",
      line: "#2D2842",
      track: "#2D2842",
    },
  },
};

/** Reference `ACC`, in display order. */
export const COLOUR_PAIRS: readonly ColourPair[] = [
  {
    id: "evergreen",
    name: "Evergreen",
    navName: "teal",
    actionName: "coral",
    navLight: "#0E5E54",
    navDark: "#5FD3BC",
    actionLight: "#C2531F",
    actionDark: "#F59A6B",
  },
  {
    id: "harbour",
    name: "Harbour",
    navName: "navy",
    actionName: "teal",
    navLight: "#12305C",
    navDark: "#8DB4F0",
    actionLight: "#0F766E",
    actionDark: "#5FD3BC",
  },
  {
    id: "twilight",
    name: "Twilight",
    navName: "indigo",
    actionName: "raspberry",
    navLight: "#3B2F8F",
    navDark: "#A5A0FF",
    actionLight: "#BE1E5A",
    actionDark: "#FF8FB5",
  },
  {
    id: "clay",
    name: "Clay",
    navName: "rust",
    actionName: "teal",
    navLight: "#8A3A12",
    navDark: "#F59A6B",
    actionLight: "#0F6E7A",
    actionDark: "#6FD0DC",
  },
  {
    id: "orchid",
    name: "Orchid",
    navName: "violet",
    actionName: "cyan",
    navLight: "#5B3BC4",
    navDark: "#B9A6FF",
    actionLight: "#0E7490",
    actionDark: "#67E8F9",
  },
  {
    id: "slate",
    name: "Slate",
    navName: "slate",
    actionName: "indigo",
    navLight: "#1F2A44",
    navDark: "#9AA8C7",
    actionLight: "#4F46E5",
    actionDark: "#A5A0FF",
  },
];

export const colourPair = (id: ColourId): ColourPair => {
  const pair = COLOUR_PAIRS.find((p) => p.id === id);
  if (!pair) throw new Error(`Unknown colour pair: ${id}`);
  return pair;
};

/**
 * Fixed pipeline status colours (reference `STAT`), never tinted by the
 * colour pair. Order: awaiting, screening, interview, offer, rejected.
 */
export const STATUS: Record<
  ResolvedMode,
  readonly [string, string, string, string, string]
> = {
  light: ["#CFC9BA", "#9FD0C4", "#3F9A8B", "#0E5E54", "#D9A4A4"],
  dark: ["#6B665A", "#4F8F82", "#5FBFAB", "#8EE3CF", "#B9696A"],
};

export const WARNING = {
  light: { bg: "#FFF4DD", fg: "#8A5200", border: "#F0D9A5" },
  dark: { bg: "#3A2A08", fg: "#FFC76B", border: "#6B4C14" },
  dot: "#D9922B",
} as const;

export const DANGER = {
  light: { bg: "#FBEDED", fg: "#A12B2B", border: "#E3B4B4" },
  dark: { bg: "#3A1616", fg: "#FF9B9B", border: "#6B2A2A" },
} as const;

/** Text on an action fill. */
export const ACTION_INK: Record<ResolvedMode, string> = {
  light: "#FFFFFF",
  dark: "#0B0C14",
};

/** Port of the reference `tok(theme, mode)` for one colour pair. */
export function resolveTokens(
  themeId: ThemeId,
  colours: ColourId,
  mode: ResolvedMode,
): ResolvedTokens {
  const th = THEMES[themeId];
  const a = colourPair(colours);
  const m = mode === "light";
  const c = m ? th.L : th.D;
  const nav = m ? a.navLight : a.navDark;
  const acc = m ? a.actionLight : a.actionDark;
  const bg = mix(c.bg, nav, m ? th.bgK[0] : th.bgK[1]);
  const surf = c.surf;
  const warn = m ? WARNING.light : WARNING.dark;
  const danger = m ? DANGER.light : DANGER.dark;

  const base = {
    theme: th,
    mode,
    bg,
    surf,
    ink: c.ink,
    mut: c.mut,
    line: c.line,
    track: c.track,
    nav,
    acc,
    accBright: a.actionDark,
    accInk: ACTION_INK[mode],
    tint: mix(surf, nav, m ? 0.1 : 0.16),
    tint2: mix(surf, nav, m ? 0.05 : 0.09),
    pillBg: warn.bg,
    pillFg: warn.fg,
    amb: WARNING.dot,
    warnLine: warn.border,
    dBg: danger.bg,
    dFg: danger.fg,
    dLine: danger.border,
    st: STATUS[mode],
  };

  if (th.sideStyle === "dark") {
    const side = m ? mix(nav, "#0A0F12", 0.6) : mix("#0A0A0A", nav, 0.12);
    const sideInk = m ? mix("#FFFFFF", side, 0.28) : "#C9C2B6";
    return {
      ...base,
      side,
      // ADDED: the action colour is ~2.3-2.9:1 on this dark column in light
      // mode, so the ring starts from the bright action colour and moves
      // toward white until it reaches 3:1.
      sideRing: towardContrast(a.actionDark, side, "#FFFFFF", 3),
      sideInk,
      brandInk: "#FFFFFF",
      navOnBg: "rgba(255,255,255,0.1)",
      navOnInk: "#FFFFFF",
      navBar: a.actionDark,
      sbBg: "rgba(255,255,255,0.06)",
      sbBorder: "rgba(255,255,255,0.16)",
      sbInk: "#FFFFFF",
      sbSub: sideInk,
      sideBorderColour: "transparent",
      sideBorderWidth: "0px",
    };
  }

  if (th.sideStyle === "light") {
    const navOnBg = m ? mix("#FFFFFF", nav, 0.13) : mix(surf, nav, 0.2);
    const side = m ? mix("#FFFFFF", nav, 0.05) : mix(c.bg, nav, 0.05);
    return {
      ...base,
      side,
      // ADDED: action colour, moved toward ink only if it is below 3:1.
      sideRing: towardContrast(acc, side, c.ink, 3),
      sideInk: c.mut,
      brandInk: c.ink,
      navOnBg,
      // ADJUSTED: the reference uses the action colour as-is for the active
      // nav label. On the nav-tinted row that is below 4.5:1 for Ledger light
      // with Evergreen (3.76), Harbour (4.29) and Orchid (4.38), so the label
      // is darkened toward ink just enough to pass. Other combinations keep
      // the exact action colour. The 2px bar (navBar) is unchanged.
      navOnInk: towardContrast(acc, navOnBg, c.ink, 4.5),
      navBar: acc,
      sbBg: surf,
      sbBorder: c.line,
      sbInk: c.ink,
      sbSub: c.mut,
      sideBorderColour: c.line,
      sideBorderWidth: "1px",
    };
  }

  const floatSide = m ? mix(nav, "#000000", 0.18) : mix("#1B182A", nav, 0.28);
  return {
    ...base,
    side: floatSide,
    // ADDED: bright action colour on the vivid card, toward white until 3:1.
    sideRing: towardContrast(a.actionDark, floatSide, "#FFFFFF", 3),
    sideInk: "rgba(255,255,255,0.78)",
    brandInk: "#FFFFFF",
    navOnBg: "rgba(255,255,255,0.2)",
    navOnInk: "#FFFFFF",
    navBar: "transparent",
    sbBg: "rgba(255,255,255,0.14)",
    sbBorder: "rgba(255,255,255,0.0)",
    sbInk: "#FFFFFF",
    sbSub: "rgba(255,255,255,0.75)",
    sideBorderColour: "transparent",
    sideBorderWidth: "0px",
  };
}

/**
 * Return `fg`, or `fg` mixed toward `toward` in 0.02 steps until it reaches
 * `min`:1 on the opaque `bg`. Used only where the reference value fails.
 */
function towardContrast(
  fg: string,
  bg: string,
  toward: string,
  min: number,
): string {
  for (let k = 0; k <= 1; k = Math.round((k + 0.02) * 100) / 100) {
    const candidate = k === 0 ? fg : mix(fg, toward, k);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return toward;
}

const px = (n: number) => `${n}px`;

/**
 * CSS custom properties for one combination, keyed by variable name.
 * Mapping: "Variable mapping" table in
 * docs/superpowers/specs/2026-11-12-appearance-design.md.
 */
export function buildTokens(
  themeId: ThemeId,
  colours: ColourId,
  mode: ResolvedMode,
): Record<string, string> {
  const t = resolveTokens(themeId, colours, mode);
  const th = t.theme;
  const [awaiting, screening, interview, offer, rejected] = t.st;
  const sidebarPrimaryInk =
    th.sideStyle === "dark"
      ? ACTION_INK.dark // bar is the bright (dark-mode) action colour
      : th.sideStyle === "light"
        ? t.accInk
        : t.navOnInk;

  return {
    // Surfaces and text
    "--background": t.bg,
    "--foreground": t.ink,
    "--card": t.surf,
    "--card-foreground": t.ink,
    "--popover": t.surf,
    "--popover-foreground": t.ink,
    "--secondary": t.tint2,
    "--secondary-foreground": t.ink,
    "--accent": t.tint,
    "--accent-foreground": t.ink,
    "--muted": t.track,
    "--muted-foreground": t.mut,
    "--border": t.line,
    "--input": t.line,
    "--tint": t.tint,
    "--tint-2": t.tint2,
    "--nav": t.nav,

    // Action colour
    "--primary": t.acc,
    "--primary-foreground": t.accInk,
    "--ring": t.acc,
    "--action": t.acc,
    "--action-foreground": t.accInk,
    "--action-bright": t.accBright,

    // Sidebar
    "--sidebar": t.side,
    "--sidebar-foreground": t.sideInk,
    "--sidebar-accent": t.navOnBg,
    "--sidebar-accent-foreground": t.navOnInk,
    "--sidebar-primary": t.navBar,
    "--sidebar-primary-foreground": sidebarPrimaryInk,
    "--sidebar-border": t.sideBorderColour,
    "--sidebar-border-width": t.sideBorderWidth,
    "--sidebar-ring": t.sideRing,
    "--sidebar-brand": t.brandInk,
    "--sidebar-footer-bg": t.sbBg,
    "--sidebar-footer-border": t.sbBorder,
    "--sidebar-footer-foreground": t.sbInk,
    "--sidebar-footer-muted": t.sbSub,

    // Fixed semantic colours
    "--bucket-awaiting": awaiting,
    "--bucket-screening": screening,
    "--bucket-interview": interview,
    "--bucket-offer": offer,
    "--bucket-rejected": rejected,
    "--warning-bg": t.pillBg,
    "--warning-fg": t.pillFg,
    "--warning-border": t.warnLine,
    "--warning-dot": t.amb,
    "--danger-bg": t.dBg,
    "--danger-fg": t.dFg,
    "--danger-border": t.dLine,
    "--destructive": t.dFg,
    "--destructive-foreground": t.accInk,

    // Type
    "--heading-font": th.hf,
    "--heading-weight": String(th.hw),
    "--heading-size": px(th.hs),
    "--page-title-size": px(th.h1s),
    "--font-sans": th.bf,
    "--font-mono": th.mf,
    "--label-transform": th.labelCase ? "uppercase" : "none",

    // Shape and density
    "--radius": px(th.r),
    "--radius-tile": px(th.tileR),
    "--radius-button": px(th.btnR),
    "--radius-pill": px(th.pillR),
    "--radius-popover": px(th.popR),
    "--radius-nav": px(th.navR),
    "--nav-item-height": px(th.navH),
    "--density-pad": px(th.pad),
    "--card-shadow": th.shadow,
    "--card-border-width": th.cardBorder ? "1px" : "0px",
    "--bar-height": px(th.barH),
    "--bar-gap": px(th.barGap),
    "--bar-radius": px(th.barR),
    "--tile-min-height": px(th.tileH),
    "--tile-number-size": px(th.tileNum),
    "--tile-number-weight": String(th.tileNumW),
  };
}

import {
  APPEARANCE_STORAGE_KEY,
  type AppearanceChoice,
  COLOUR_IDS,
  DEFAULT_APPEARANCE,
  MODES,
  type ResolvedMode,
  THEME_IDS,
} from "./types";

const oneOf = <T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/** Validate untrusted input field by field, falling back to the defaults. */
export function parseAppearanceChoice(raw: unknown): AppearanceChoice {
  const v =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mode: oneOf(MODES, v.mode, DEFAULT_APPEARANCE.mode),
    theme: oneOf(THEME_IDS, v.theme, DEFAULT_APPEARANCE.theme),
    colours: oneOf(COLOUR_IDS, v.colours, DEFAULT_APPEARANCE.colours),
  };
}

export function readStoredAppearance(): AppearanceChoice {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return parseAppearanceChoice(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function writeStoredAppearance(choice: AppearanceChoice): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage can be unavailable (private mode, quota); the choice still
    // applies for this session.
  }
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** Set the three data attributes and keep `.dark` in step with the mode. */
export function applyAppearance(
  choice: AppearanceChoice,
  resolvedMode: ResolvedMode,
  root: HTMLElement = document.documentElement,
): void {
  root.setAttribute("data-mode", resolvedMode);
  root.setAttribute("data-theme", choice.theme);
  root.setAttribute("data-colours", choice.colours);
  root.classList.toggle("dark", resolvedMode === "dark");
}

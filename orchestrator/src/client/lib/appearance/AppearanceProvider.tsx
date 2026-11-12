import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyAppearance,
  DARK_QUERY,
  readStoredAppearance,
  systemPrefersDark,
  writeStoredAppearance,
} from "./choice";
import type {
  AppearanceChoice,
  ColourId,
  Mode,
  ResolvedMode,
  ThemeId,
} from "./types";

export interface AppearanceContextValue {
  choice: AppearanceChoice;
  /** `choice.mode` with System resolved against the OS setting. */
  resolvedMode: ResolvedMode;
  setMode: (mode: Mode) => void;
  setTheme: (theme: ThemeId) => void;
  setColours: (colours: ColourId) => void;
  /** Flip the resolved mode and set it explicitly (leaves System). */
  toggleLightDark: () => void;
}

/** Exported so tests can supply a fixed value with spy setters. */
export const AppearanceContext = createContext<AppearanceContextValue | null>(
  null,
);

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [choice, setChoice] = useState<AppearanceChoice>(readStoredAppearance);
  const [osDark, setOsDark] = useState<boolean>(systemPrefersDark);

  const resolvedMode: ResolvedMode =
    choice.mode === "system" ? (osDark ? "dark" : "light") : choice.mode;

  // Follow OS changes live while in System mode.
  useEffect(() => {
    if (choice.mode !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    setOsDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setOsDark(event.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, [choice.mode]);

  useEffect(() => {
    applyAppearance(choice, resolvedMode);
  }, [choice, resolvedMode]);

  // Persist outside the state updater (updaters must stay pure). Write only
  // when the choice differs from what was read or last written, so the
  // initial mount (run twice under StrictMode) never stores the defaults
  // for a first-time visitor.
  const lastPersisted = useRef<string>(JSON.stringify(choice));
  useEffect(() => {
    const serialized = JSON.stringify(choice);
    if (serialized === lastPersisted.current) return;
    lastPersisted.current = serialized;
    writeStoredAppearance(choice);
  }, [choice]);

  const update = useCallback((patch: Partial<AppearanceChoice>) => {
    setChoice((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      choice,
      resolvedMode,
      setMode: (mode) => update({ mode }),
      setTheme: (theme) => update({ theme }),
      setColours: (colours) => update({ colours }),
      toggleLightDark: () =>
        update({ mode: resolvedMode === "dark" ? "light" : "dark" }),
    }),
    [choice, resolvedMode, update],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
};

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used inside <AppearanceProvider>");
  }
  return ctx;
}

/**
 * Like `useAppearance`, but returns null outside the provider. Shared chrome
 * (page header, sidebar) uses it so components rendered without the app
 * shell (stories, isolated tests) still work and just omit the controls.
 */
export function useOptionalAppearance(): AppearanceContextValue | null {
  return useContext(AppearanceContext);
}

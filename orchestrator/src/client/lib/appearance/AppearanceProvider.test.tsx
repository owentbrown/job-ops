import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider, useAppearance } from "./AppearanceProvider";
import { parseAppearanceChoice } from "./choice";
import { APPEARANCE_STORAGE_KEY } from "./types";

type Listener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return dark;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    addListener: (l: Listener) => listeners.add(l),
    removeListener: (l: Listener) => listeners.delete(l),
    dispatchEvent: () => true,
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    setDark(next: boolean) {
      dark = next;
      for (const l of listeners) l({ matches: next } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppearanceProvider>{children}</AppearanceProvider>
);

const html = () => document.documentElement;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute("data-mode");
  html().removeAttribute("data-theme");
  html().removeAttribute("data-colours");
  html().classList.remove("dark");
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useAppearance", () => {
  it("defaults to System · Editorial · Evergreen and resolves the OS mode", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useAppearance(), { wrapper });
    expect(result.current.choice).toEqual({
      mode: "system",
      theme: "editorial",
      colours: "evergreen",
    });
    expect(result.current.resolvedMode).toBe("dark");
    expect(html().getAttribute("data-mode")).toBe("dark");
    expect(html().getAttribute("data-theme")).toBe("editorial");
    expect(html().getAttribute("data-colours")).toBe("evergreen");
    expect(html().classList.contains("dark")).toBe(true);
  });

  it("reads and validates the stored choice", () => {
    installMatchMedia(false);
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ mode: "dark", theme: "ledger", colours: "nope" }),
    );
    const { result } = renderHook(() => useAppearance(), { wrapper });
    expect(result.current.choice).toEqual({
      mode: "dark",
      theme: "ledger",
      colours: "evergreen",
    });
    expect(html().getAttribute("data-theme")).toBe("ledger");
    expect(html().classList.contains("dark")).toBe(true);
  });

  it("setters update html attributes and localStorage", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useAppearance(), { wrapper });
    act(() => result.current.setTheme("soft"));
    act(() => result.current.setColours("orchid"));
    act(() => result.current.setMode("dark"));
    expect(html().getAttribute("data-theme")).toBe("soft");
    expect(html().getAttribute("data-colours")).toBe("orchid");
    expect(html().getAttribute("data-mode")).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "null"),
    ).toEqual({ mode: "dark", theme: "soft", colours: "orchid" });
  });

  it("follows OS changes live in System mode only", () => {
    const os = installMatchMedia(false);
    const { result } = renderHook(() => useAppearance(), { wrapper });
    expect(result.current.resolvedMode).toBe("light");

    act(() => os.setDark(true));
    expect(result.current.resolvedMode).toBe("dark");
    expect(html().classList.contains("dark")).toBe(true);

    act(() => result.current.setMode("light"));
    expect(os.listenerCount()).toBe(0);
    act(() => os.setDark(false));
    act(() => os.setDark(true));
    expect(result.current.resolvedMode).toBe("light");
    expect(html().classList.contains("dark")).toBe(false);
  });

  it("toggleLightDark flips the resolved mode and leaves System", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useAppearance(), { wrapper });
    act(() => result.current.toggleLightDark());
    expect(result.current.choice.mode).toBe("light");
    expect(result.current.resolvedMode).toBe("light");
    act(() => result.current.toggleLightDark());
    expect(result.current.choice.mode).toBe("dark");
  });

  it("works without matchMedia (System resolves to light)", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useAppearance(), { wrapper });
    expect(result.current.resolvedMode).toBe("light");
    expect(html().getAttribute("data-mode")).toBe("light");
  });

  it("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAppearance())).toThrow(
      /AppearanceProvider/,
    );
    spy.mockRestore();
  });
});

describe("parseAppearanceChoice", () => {
  it("falls back field by field for junk input", () => {
    expect(parseAppearanceChoice("x")).toEqual({
      mode: "system",
      theme: "editorial",
      colours: "evergreen",
    });
    expect(parseAppearanceChoice({ mode: "light", theme: 3 })).toEqual({
      mode: "light",
      theme: "editorial",
      colours: "evergreen",
    });
  });
});

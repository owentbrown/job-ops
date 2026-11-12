import {
  AppearanceContext,
  type AppearanceContextValue,
  AppearanceProvider,
} from "@client/lib/appearance/AppearanceProvider";
import { APPEARANCE_STORAGE_KEY } from "@client/lib/appearance/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceControls, describeAppearance } from "./AppearanceControls";

const makeValue = (
  overrides: Partial<AppearanceContextValue> = {},
): AppearanceContextValue => ({
  choice: { mode: "system", theme: "editorial", colours: "evergreen" },
  resolvedMode: "light",
  setMode: vi.fn(),
  setTheme: vi.fn(),
  setColours: vi.fn(),
  toggleLightDark: vi.fn(),
  ...overrides,
});

const renderWith = (
  value: AppearanceContextValue,
  size?: "compact" | "large",
) =>
  render(
    <AppearanceContext.Provider value={value}>
      <AppearanceControls size={size} />
    </AppearanceContext.Provider>,
  );

const group = (name: string | RegExp) => screen.getByRole("group", { name });

describe("AppearanceControls", () => {
  beforeEach(() => localStorage.clear());

  it("calls the hook setters for mode, theme and colours", () => {
    const value = makeValue();
    renderWith(value);

    fireEvent.click(
      within(group("Mode")).getByRole("button", { name: "Dark" }),
    );
    expect(value.setMode).toHaveBeenCalledWith("dark");

    fireEvent.click(
      within(group("Theme")).getByRole("button", { name: "Ledger" }),
    );
    expect(value.setTheme).toHaveBeenCalledWith("ledger");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Twilight: sidebar indigo, actions raspberry",
      }),
    );
    expect(value.setColours).toHaveBeenCalledWith("twilight");
  });

  it("marks the current choice with aria-pressed", () => {
    renderWith(
      makeValue({
        choice: { mode: "dark", theme: "soft", colours: "clay" },
        resolvedMode: "dark",
      }),
    );
    const mode = group("Mode");
    expect(within(mode).getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(mode).getByRole("button", { name: "System" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(group("Theme")).getByRole("button", { name: "Soft" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Clay: sidebar rust, actions teal" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: "Evergreen: sidebar teal, actions coral",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("names all six swatches and three theme cards", () => {
    renderWith(makeValue());
    expect(within(group(/^Colours/)).getAllByRole("button")).toHaveLength(6);
    for (const name of [
      "Evergreen: sidebar teal, actions coral",
      "Harbour: sidebar navy, actions teal",
      "Orchid: sidebar violet, actions cyan",
      "Slate: sidebar slate, actions indigo",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(group("Theme")).getAllByRole("button")).toHaveLength(3);
  });

  it("previews each theme with its own variables in the current colours", () => {
    const { container } = renderWith(
      makeValue({
        choice: { mode: "light", theme: "editorial", colours: "harbour" },
      }),
    );
    const soft = container.querySelector<HTMLElement>(
      '[data-theme-preview="soft"]',
    );
    const ledger = container.querySelector<HTMLElement>(
      '[data-theme-preview="ledger"]',
    );
    expect(soft?.style.getPropertyValue("--sidebar")).not.toBe("");
    expect(soft?.style.getPropertyValue("--radius-tile")).not.toBe(
      ledger?.style.getPropertyValue("--radius-tile"),
    );
    expect(
      container.querySelector('[data-preview-sidebar="float"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-preview-tile="filled"]'),
    ).not.toBeNull();
  });

  it("explains System mode only in the large size", () => {
    const { unmount } = renderWith(makeValue(), "compact");
    expect(screen.queryByText(/follows your computer/i)).toBeNull();
    unmount();
    renderWith(makeValue(), "large");
    expect(screen.getByText(/follows your computer/i)).toBeInTheDocument();
  });

  it("applies choices through the real provider", () => {
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );
    const ledger = within(group("Theme")).getByRole("button", {
      name: "Ledger",
    });
    fireEvent.click(ledger);
    expect(ledger).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "ledger");
    expect(
      JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ theme: "ledger" });
  });

  it("describes the choice as theme · colours · mode", () => {
    expect(
      describeAppearance({
        mode: "system",
        theme: "editorial",
        colours: "evergreen",
      }),
    ).toBe("Editorial · Evergreen · System");
    expect(
      describeAppearance({ mode: "dark", theme: "soft", colours: "orchid" }),
    ).toBe("Soft · Orchid · Dark");
  });
});

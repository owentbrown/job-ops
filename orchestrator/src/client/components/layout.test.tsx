import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Home } from "lucide-react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppearanceContext,
  type AppearanceContextValue,
  AppearanceProvider,
} from "../lib/appearance/AppearanceProvider";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import {
  PageHeader,
  PersistentSidebar,
  PersistentSidebarContext,
} from "./layout";

vi.mock("@client/api", () => ({
  getAppStatus: vi.fn().mockResolvedValue({
    appMode: "local",
    capabilities: {},
    hostedTenantConfigured: false,
  }),
  logout: vi.fn(),
}));
vi.mock("../hooks/useVersionCheck", () => ({
  useVersionCheck: () => ({ version: "test", updateAvailable: false }),
}));

const Path: React.FC = () => {
  const location = useLocation();
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="hash">{location.hash}</div>
    </>
  );
};

const renderAt = (path: string) =>
  renderWithQueryClient(
    <MemoryRouter initialEntries={[path]}>
      <PersistentSidebarContext.Provider value>
        <PageHeader icon={Home} title="t" subtitle="s" />
      </PersistentSidebarContext.Provider>
      <Path />
    </MemoryRouter>,
  );

const openNav = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /open navigation menu/i }),
  );

describe("PageHeader navigation", () => {
  it("always shows the Profile sub-items", async () => {
    renderAt("/overview");
    openNav();
    expect(
      await screen.findByRole("button", { name: "About you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Document Studio" }),
    ).toBeInTheDocument();
  });

  it("marks the active item with aria-current", async () => {
    renderAt("/profile/studio/resume");
    openNav();
    expect(
      await screen.findByRole("button", { name: "Document Studio" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "About you" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("navigates to /profile from the Profile parent while inside the studio", async () => {
    renderAt("/profile/studio/resume");
    openNav();
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    await waitFor(() =>
      expect(screen.getByTestId("path")).toHaveTextContent(/^\/profile$/),
    );
  });
});

describe("PersistentSidebar", () => {
  const renderSidebar = (path: string) =>
    renderWithQueryClient(
      <MemoryRouter initialEntries={[path]}>
        <PersistentSidebar />
        <Path />
      </MemoryRouter>,
    );

  it("renders the main nav without opening the sheet, visible from lg", () => {
    renderSidebar("/overview");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const aside = nav.closest("aside");
    expect(aside).toHaveClass("hidden", "lg:flex", "fixed");
    for (const name of [
      "Overview",
      "Jobs",
      "Applications",
      "Profile",
      "Settings",
      "About you",
      "Document Studio",
    ]) {
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      within(nav).getByRole("button", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: /account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Appearance" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/documentation/i)).toBeNull();
    expect(screen.queryByText(/version/i)).toBeNull();
  });

  it("exposes theme-structure hooks driven by appearance variables", () => {
    renderSidebar("/overview");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const aside = nav.closest("aside");
    expect(aside).toHaveAttribute("data-app-sidebar");
    // Geometry comes from styles/appearance-structure.css per theme.
    expect(aside).toHaveClass(
      "w-(--app-sidebar-width)",
      "left-(--app-sidebar-inset)",
      "top-(--app-sidebar-inset)",
      "bottom-(--app-sidebar-inset)",
      "rounded-(--app-sidebar-radius)",
      "bg-sidebar",
      "text-sidebar-foreground",
      "border-r-(length:--sidebar-border-width)",
    );
    expect(screen.getByText("JobOps")).toHaveAttribute("data-sidebar-brand");

    const active = within(nav).getByRole("button", { name: "Overview" });
    expect(active).toHaveAttribute("data-sidebar-item");
    expect(active).toHaveAttribute("data-active", "true");
    expect(active).toHaveClass(
      "h-(--nav-item-height)",
      "rounded-(--radius-nav)",
      "bg-sidebar-accent",
      "text-sidebar-accent-foreground",
      "shadow-[inset_2px_0_0_var(--sidebar-primary)]",
      "focus-visible:ring-2",
      "focus-visible:ring-sidebar-ring",
    );
    const idle = within(nav).getByRole("button", { name: "Jobs" });
    expect(idle).not.toHaveAttribute("data-active");
    expect(idle).toHaveClass("text-sidebar-foreground");
    expect(idle).not.toHaveClass("bg-sidebar-accent");

    const account = screen.getByRole("button", { name: /account/i });
    expect(account.closest("[data-sidebar-footer]")).not.toBeNull();
    expect(account).toHaveClass(
      "bg-(--sidebar-footer-bg)",
      "text-(--sidebar-footer-foreground)",
      "border-(color:--sidebar-footer-border)",
    );
  });

  it("Appearance falls back to Settings -> Appearance without a provider", () => {
    renderSidebar("/overview");
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/settings");
    expect(screen.getByTestId("hash")).toHaveTextContent("#appearance");
  });

  it("navigates immediately on click", async () => {
    renderSidebar("/overview");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/settings");
  });
});

describe("Appearance popover", () => {
  const renderWithAppearance = (path = "/overview") =>
    renderWithQueryClient(
      <AppearanceProvider>
        <MemoryRouter initialEntries={[path]}>
          <PersistentSidebar />
          <Path />
        </MemoryRouter>
      </AppearanceProvider>,
    );

  beforeEach(() => localStorage.clear());

  it("shows the current choice under the sidebar item", () => {
    renderWithAppearance();
    const trigger = screen.getByRole("button", { name: "Appearance" });
    expect(trigger).toHaveAccessibleDescription(
      "Editorial · Evergreen · System",
    );
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens the controls in a popover, moves focus in and closes on Esc", async () => {
    renderWithAppearance();
    const trigger = screen.getByRole("button", { name: "Appearance" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Appearance" });
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );
    expect(
      within(dialog).getByRole("group", { name: "Mode" }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Soft" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Dark" }));
    expect(trigger).toHaveAccessibleDescription("Soft · Evergreen · Dark");

    const link = within(dialog).getByRole("link", {
      name: /all settings live in settings → appearance/i,
    });
    expect(link).toHaveAttribute("href", "/settings#appearance");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Appearance" })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("the settings link closes the popover and navigates", async () => {
    renderWithAppearance();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    const dialog = await screen.findByRole("dialog", { name: "Appearance" });
    fireEvent.click(within(dialog).getByRole("link"));
    expect(screen.getByTestId("hash")).toHaveTextContent("#appearance");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Appearance" })).toBeNull(),
    );
  });

  it("opens from the mobile Sheet too", async () => {
    renderWithQueryClient(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/overview"]}>
          <PageHeader icon={Home} title="t" subtitle="s" />
        </MemoryRouter>
      </AppearanceProvider>,
    );
    openNav();
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Appearance" }));
    const popover = await screen.findByRole("dialog", { name: "Appearance" });
    expect(
      within(popover).getByRole("group", { name: "Theme" }),
    ).toBeInTheDocument();
  });
});

describe("PageHeader mode toggle", () => {
  const renderHeader = (value: AppearanceContextValue) =>
    renderWithQueryClient(
      <AppearanceContext.Provider value={value}>
        <MemoryRouter initialEntries={["/overview"]}>
          <PageHeader
            icon={Home}
            title="t"
            subtitle="s"
            actions={<button type="button">act</button>}
          />
        </MemoryRouter>
      </AppearanceContext.Provider>,
    );
  const value = (resolvedMode: "light" | "dark"): AppearanceContextValue => ({
    choice: { mode: "system", theme: "editorial", colours: "evergreen" },
    resolvedMode,
    setMode: vi.fn(),
    setTheme: vi.fn(),
    setColours: vi.fn(),
    toggleLightDark: vi.fn(),
  });

  it("offers dark mode in light mode and calls toggleLightDark", () => {
    const v = value("light");
    renderHeader(v);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(v.toggleLightDark).toHaveBeenCalledTimes(1);
  });

  it("offers light mode in dark mode", () => {
    renderHeader(value("dark"));
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("flips the real provider to an explicit mode", () => {
    renderWithQueryClient(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/overview"]}>
          <PageHeader icon={Home} title="t" subtitle="s" />
        </MemoryRouter>
      </AppearanceProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(document.documentElement).toHaveAttribute("data-mode", "dark");
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("is omitted without an AppearanceProvider", () => {
    renderAt("/overview");
    expect(screen.queryByRole("button", { name: /switch to/i })).toBeNull();
  });
});

describe("PageHeader hamburger", () => {
  it("is hidden at lg+ when the persistent sidebar is present", () => {
    renderAt("/overview");
    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).toHaveClass("lg:hidden");
  });

  it("the mobile Sheet uses the sidebar colours", async () => {
    renderAt("/overview");
    openNav();
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveAttribute("data-app-sidebar-sheet");
    expect(sheet).toHaveClass("bg-sidebar", "text-sidebar-foreground");
  });

  it("stays visible when there is no persistent sidebar", () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <PageHeader icon={Home} title="t" subtitle="s" />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).not.toHaveClass("lg:hidden");
  });
});

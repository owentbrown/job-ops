import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Home } from "lucide-react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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

  it("Appearance opens settings display and is active there", () => {
    renderSidebar("/overview");
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/settings");
    expect(screen.getByTestId("hash")).toHaveTextContent("#display");
    expect(screen.getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("navigates immediately on click", async () => {
    renderSidebar("/overview");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/settings");
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

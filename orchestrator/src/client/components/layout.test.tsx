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

const Path: React.FC = () => (
  <div data-testid="path">{useLocation().pathname}</div>
);

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
    expect(screen.getByText("Version test")).toBeInTheDocument();
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

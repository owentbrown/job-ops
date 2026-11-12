import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Home } from "lucide-react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { PageHeader } from "./layout";

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
      <PageHeader icon={Home} title="t" />
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

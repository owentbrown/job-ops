import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ActionTiles } from "./ActionTiles";

const actions = {
  readyCount: 3,
  discoveredCount: 0,
  inboxPendingCount: 2,
  allJobsCount: 40,
};

const renderTiles = (challenge: { extractorName: string } | null = null) =>
  render(
    <MemoryRouter>
      <ActionTiles actions={actions} challenge={challenge} />
    </MemoryRouter>,
  );

describe("ActionTiles", () => {
  it("links each tile to its page", () => {
    renderTiles();
    expect(
      screen.getByRole("link", { name: /3 jobs to review/i }),
    ).toHaveAttribute("href", "/jobs/ready");
    expect(
      screen.getByRole("link", { name: /0 new jobs discovered/i }),
    ).toHaveAttribute("href", "/jobs/discovered");
    expect(
      screen.getByRole("link", { name: /2 emails to match or confirm/i }),
    ).toHaveAttribute("href", "/applications/inbox");
  });

  it("shows the browser-check tile only when a search is blocked", () => {
    renderTiles();
    expect(screen.queryByText(/blocking your search/i)).not.toBeInTheDocument();
    renderTiles({ extractorName: "Hiring Cafe" });
    expect(screen.getByText(/blocking your search/i)).toBeInTheDocument();
    expect(screen.getByText(/hiring cafe/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /solve/i })).toHaveAttribute(
      "href",
      "/jobs/ready",
    );
  });
});

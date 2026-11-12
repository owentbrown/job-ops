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
    expect(
      screen.getByRole("link", {
        name: /solve browser check for hiring cafe/i,
      }),
    ).toHaveAttribute("href", "/jobs/ready");
  });

  it("exposes structure hooks for the per-theme tile styles", () => {
    const { container } = renderTiles({ extractorName: "Hiring Cafe" });
    const wrap = container.querySelector("[data-action-tiles]");
    expect(wrap).toHaveClass("overview-tiles");
    const tiles = container.querySelectorAll("[data-tile]");
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) expect(tile).toHaveClass("overview-tile");
    // The browser check is the warning tone and never takes a Soft tint.
    expect(tiles[0]).toHaveAttribute("data-tone", "warning");
    expect(tiles[0]).not.toHaveAttribute("data-tint");
    // The three action tiles take Soft's tint levels 1-3 in order.
    expect(
      Array.from(tiles)
        .slice(1)
        .map((t) => t.getAttribute("data-tint")),
    ).toEqual(["1", "2", "3"]);
    expect(tiles[1]).not.toHaveAttribute("data-tone");
  });

  it("sizes tile numbers and labels from the theme variables", () => {
    const { container } = renderTiles();
    const number = container.querySelector("[data-tile-number]");
    expect(number).toHaveClass(
      "font-mono",
      "text-(length:--tile-number-size)",
      "font-(weight:--tile-number-weight)",
    );
    expect(screen.getByText("Review")).toHaveClass(
      "[text-transform:var(--label-transform)]",
      "[letter-spacing:var(--label-tracking)]",
    );
  });
});

import { AppModeContext } from "@client/components/layout";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "./ApplicationsPage";

vi.mock("./InProgressBoardPage", () => ({
  InProgressBoardPage: () => <div>board-body</div>,
}));
vi.mock("./TrackingInboxPage", () => ({
  TrackingInboxPage: () => <div>inbox-body</div>,
}));

const renderAt = (path: string, appMode: "local" | "hosted" = "local") =>
  render(
    <AppModeContext.Provider value={{ appMode, isPending: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/applications/:tab" element={<ApplicationsPage />} />
        </Routes>
      </MemoryRouter>
    </AppModeContext.Provider>,
  );

describe("ApplicationsPage", () => {
  it("shows the board tab", () => {
    renderAt("/applications/board");
    expect(screen.getByText("board-body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute(
      "href",
      "/applications/inbox",
    );
  });

  it("shows the inbox tab", () => {
    renderAt("/applications/inbox");
    expect(screen.getByText("inbox-body")).toBeInTheDocument();
  });

  it("hides the inbox in hosted mode", () => {
    renderAt("/applications/inbox", "hosted");
    expect(screen.queryByText("inbox-body")).toBeNull();
    expect(screen.queryByRole("link", { name: "Inbox" })).toBeNull();
    expect(screen.getByText("board-body")).toBeInTheDocument();
  });
});

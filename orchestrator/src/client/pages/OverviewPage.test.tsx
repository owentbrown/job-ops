import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { OverviewPage } from "./OverviewPage";

vi.mock("@/client/api", () => ({
  getOverview: vi.fn(),
  getPipelineProgressSnapshot: vi.fn(),
  getPipelineStatus: vi.fn(),
  getSearchSchedule: vi.fn(),
}));

const overview = {
  rangeDays: 7,
  pipeline: {
    total: 3,
    buckets: { awaiting: 2, screening: 1, interview: 0, offer: 0, rejected: 0 },
    withdrawn: 0,
  },
  actions: {
    readyCount: 2,
    discoveredCount: 4,
    inboxPendingCount: 1,
    allJobsCount: 20,
  },
  pace: {
    perDay: [{ date: "2026-11-10", count: 1 }],
    avgPerDay: 0.4,
    bestDay: { date: "2026-11-10", count: 1 },
    medianFoundToAppliedDays: 2,
  },
  replies: {
    applied: 3,
    replied: 0,
    responseRate: 0,
    medianDaysToReply: null,
    emailsMatched: 0,
  },
  sources: { rows: [] },
  scoreBands: { rows: [] },
  skips: { highScoreSkipped: [] },
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/overview?duration=7"]}>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOverview).mockResolvedValue(overview as never);
    vi.mocked(api.getPipelineProgressSnapshot).mockResolvedValue({
      step: "idle",
      pendingChallenges: [],
    } as never);
    vi.mocked(api.getPipelineStatus).mockResolvedValue({
      isRunning: false,
      lastRun: null,
      nextScheduledRun: null,
    } as never);
    vi.mocked(api.getSearchSchedule).mockResolvedValue({
      enabled: false,
      hour: 8,
      days: [],
    } as never);
  });

  it("renders the three sections and reloads when the range changes", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: /Pipeline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Needs your action/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Insights/ }),
    ).toBeInTheDocument();
    expect(api.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ range: 7 }),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "30d" }));
    await waitFor(() =>
      expect(api.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ range: 30 }),
      ),
    );
  });
});

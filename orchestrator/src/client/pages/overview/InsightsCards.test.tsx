import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { PaceCard } from "./PaceCard";
import { RepliesCard } from "./RepliesCard";
import { RolesCard } from "./RolesCard";
import { ScoreBandsCard } from "./ScoreBandsCard";
import { SkipsCard } from "./SkipsCard";
import { SourceYieldTable } from "./SourceYieldTable";

vi.mock("@/client/api", async (orig) => ({
  ...(await orig<typeof import("@/client/api")>()),
  updateJob: vi.fn().mockResolvedValue({}),
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("RepliesCard", () => {
  it("shows dashes and a hint before the first reply", () => {
    wrap(
      <RepliesCard
        replies={{
          applied: 12,
          replied: 0,
          responseRate: null,
          medianDaysToReply: null,
          emailsMatched: 0,
        }}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/too early to read/i)).toBeInTheDocument();
  });

  it("shows rate, median and emails once replies exist", () => {
    wrap(
      <RepliesCard
        replies={{
          applied: 20,
          replied: 5,
          responseRate: 0.25,
          medianDaysToReply: 4.5,
          emailsMatched: 7,
        }}
      />,
    );
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/5 of 20 applications/i)).toBeInTheDocument();
    expect(screen.getByText("4.5 days")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("PaceCard", () => {
  it("shows average, best day and found to applied", () => {
    wrap(
      <PaceCard
        pace={{
          perDay: [
            { date: "2026-11-11", count: 2 },
            { date: "2026-11-12", count: 0 },
          ],
          avgPerDay: 1,
          bestDay: { date: "2026-11-11", count: 2 },
          medianFoundToAppliedDays: 1.5,
        }}
      />,
    );
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText(/2 on /i)).toBeInTheDocument();
    expect(screen.getByText("1.5 days")).toBeInTheDocument();
  });
});

describe("SourceYieldTable", () => {
  it("shows a reply rate only from three applications", () => {
    wrap(
      <SourceYieldTable
        rows={[
          { source: "linkedin", results: 40, applied: 5, replied: 2 },
          { source: "indeed", results: 10, applied: 2, replied: 1 },
        ]}
      />,
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});

describe("SourceYieldTable before the first reply", () => {
  it("shows no reply rates and a hint", () => {
    wrap(
      <SourceYieldTable
        rows={[
          { source: "linkedin", results: 40, applied: 5, replied: 0 },
          { source: "indeed", results: 10, applied: 3, replied: 0 },
        ]}
      />,
    );
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(
      screen.getByText("Reply rates appear after your first reply."),
    ).toBeInTheDocument();
  });
});

describe("ScoreBandsCard", () => {
  it("hints instead of drawing bars with too little data", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 1, replied: 0 },
          { band: "70-79", applied: 0, replied: 0 },
          { band: "80-89", applied: 2, replied: 0 },
          { band: "90+", applied: 0, replied: 0 },
        ]}
      />,
    );
    expect(
      screen.getByText(/fills in after your first reply/i),
    ).toBeInTheDocument();
  });

  it("hints when nothing has replied even with enough applications", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 5, replied: 0 },
          { band: "80-89", applied: 5, replied: 0 },
        ]}
      />,
    );
    expect(
      screen.getByText(/fills in after your first reply/i),
    ).toBeInTheDocument();
  });

  it("says higher scores get more replies", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 5, replied: 0 },
          { band: "70-79", applied: 0, replied: 0 },
          { band: "80-89", applied: 5, replied: 3 },
          { band: "90+", applied: 0, replied: 0 },
        ]}
      />,
    );
    expect(
      screen.getByText("Higher scores are getting more replies."),
    ).toBeInTheDocument();
  });

  it("says scores aren't predicting replies when the lowest band leads", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 5, replied: 3 },
          { band: "70-79", applied: 0, replied: 0 },
          { band: "80-89", applied: 5, replied: 1 },
          { band: "90+", applied: 0, replied: 0 },
        ]}
      />,
    );
    expect(
      screen.getByText("Scores aren't predicting replies yet."),
    ).toBeInTheDocument();
  });

  it("says there is no clear pattern otherwise", () => {
    wrap(
      <ScoreBandsCard
        rows={[
          { band: "<70", applied: 5, replied: 1 },
          { band: "70-79", applied: 5, replied: 3 },
          { band: "80-89", applied: 5, replied: 1 },
        ]}
      />,
    );
    expect(screen.getByText("No clear pattern yet.")).toBeInTheDocument();
  });
});

describe("RolesCard", () => {
  it("explains that role categories arrive later", () => {
    wrap(<RolesCard />);
    expect(
      screen.getByText(/once applications are categorized/i),
    ).toBeInTheDocument();
  });
});

describe("SkipsCard", () => {
  beforeEach(() => vi.mocked(api.updateJob).mockClear());

  it("lists high-score skips and reconsiders one", async () => {
    wrap(
      <SkipsCard
        highScoreSkipped={[
          { jobId: "j1", title: "Growth Lead", employer: "Acme", score: 88 },
        ]}
      />,
    );
    expect(screen.getByText("Growth Lead")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /reconsider growth lead/i }),
    );
    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith("j1", {
        status: "discovered",
      }),
    );
  });

  it("says so when there is nothing to reconsider", () => {
    wrap(<SkipsCard highScoreSkipped={[]} />);
    expect(screen.getByText(/no skipped jobs scored 80/i)).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { CatchUpNotice } from "./CatchUpNotice";
import { PaceCard } from "./PaceCard";
import { RepliesCard } from "./RepliesCard";
import { ResponseRateCard } from "./ResponseRateCard";
import { SkipsCard } from "./SkipsCard";

vi.mock("@/client/api", async (orig) => ({
  ...(await orig<typeof import("@/client/api")>()),
  updateJob: vi.fn().mockResolvedValue({}),
  getBackfillEstimate: vi.fn().mockResolvedValue({
    kind: "roles",
    count: 0,
    calls: 0,
    estimatedCost: null,
  }),
  runBackfill: vi.fn().mockResolvedValue({
    kind: "roles",
    categorized: 23,
    failedBatches: 0,
  }),
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
    expect(screen.getByText(/0 of 12 applications/i)).toBeInTheDocument();
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
    expect(
      screen.getByRole("img", {
        name: /applications per day: 2 in the last 2 days/i,
      }),
    ).toBeInTheDocument();
  });
});

describe("ResponseRateCard by source", () => {
  const showSource = () =>
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Source" }));

  it("shows a reply rate and bar only from three applications", () => {
    wrap(
      <ResponseRateCard
        scoreBands={[]}
        sources={[
          { source: "linkedin", results: 40, applied: 5, replied: 2 },
          { source: "indeed", results: 10, applied: 2, replied: 1 },
        ]}
      />,
    );
    showSource();
    expect(screen.getByText("2 of 5 · 40%")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("40 found")).toBeInTheDocument();
  });

  it("shows applied counts and a hint before the first reply", () => {
    wrap(
      <ResponseRateCard
        scoreBands={[]}
        sources={[
          { source: "linkedin", results: 40, applied: 5, replied: 0 },
          { source: "indeed", results: 10, applied: 3, replied: 0 },
        ]}
      />,
    );
    showSource();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    expect(screen.getByText("5 applied")).toBeInTheDocument();
    expect(
      screen.getByText("Reply rates appear after your first reply."),
    ).toBeInTheDocument();
  });
});

describe("ResponseRateCard by role", () => {
  const showRole = () =>
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Role" }));

  it("says roles appear once applications are scored", () => {
    wrap(<ResponseRateCard scoreBands={[]} sources={[]} />);
    showRole();
    expect(
      screen.getByText("Appears once your applications are scored."),
    ).toBeInTheDocument();
  });

  it("shows role rows and a focus note when many fall outside", () => {
    wrap(
      <ResponseRateCard
        scoreBands={[]}
        sources={[]}
        roles={{
          rows: [
            { category: "growth manager", applied: 18, replied: 7 },
            { category: "Other", applied: 2, replied: 1 },
          ],
          otherShare: 0.25,
          uncategorizedApplied: 0,
        }}
      />,
    );
    showRole();
    expect(screen.getByText("7 of 18 · 39%")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(
      screen.getByText(/25% of applications fall outside your search roles/),
    ).toBeInTheDocument();
  });

  it("has no focus note when few fall outside", () => {
    wrap(
      <ResponseRateCard
        scoreBands={[]}
        sources={[]}
        roles={{
          rows: [{ category: "growth manager", applied: 9, replied: 1 }],
          otherShare: 0.1,
          uncategorizedApplied: 0,
        }}
      />,
    );
    showRole();
    expect(screen.queryByText(/fall outside/)).not.toBeInTheDocument();
  });
});

describe("CatchUpNotice", () => {
  beforeEach(() => vi.mocked(api.runBackfill).mockClear());

  it("shows the count and cost and runs only on click", async () => {
    vi.mocked(api.getBackfillEstimate).mockResolvedValueOnce({
      kind: "roles",
      count: 23,
      calls: 1,
      estimatedCost: 0.02,
    });
    wrap(<CatchUpNotice kind="roles" noun="applications" />);
    expect(
      await screen.findByText(/23 applications have no role category/),
    ).toBeInTheDocument();
    expect(screen.getByText("est. $0.02")).toBeInTheDocument();
    expect(api.runBackfill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Categorize" }));
    await waitFor(() => expect(api.runBackfill).toHaveBeenCalledWith("roles"));
  });
});

describe("ResponseRateCard by score", () => {
  it("hints instead of drawing bars with too little data", () => {
    wrap(
      <ResponseRateCard
        sources={[]}
        scoreBands={[
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
      <ResponseRateCard
        sources={[]}
        scoreBands={[
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
      <ResponseRateCard
        sources={[]}
        scoreBands={[
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

  it("doesn't credit higher scores when 90+ is readable and lowest", () => {
    wrap(
      <ResponseRateCard
        sources={[]}
        scoreBands={[
          { band: "<70", applied: 5, replied: 2 },
          { band: "70-79", applied: 0, replied: 0 },
          { band: "80-89", applied: 5, replied: 3 },
          { band: "90+", applied: 5, replied: 0 },
        ]}
      />,
    );
    expect(
      screen.queryByText("Higher scores are getting more replies."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No clear pattern yet.")).toBeInTheDocument();
  });

  it("says scores aren't predicting replies when the lowest band leads", () => {
    wrap(
      <ResponseRateCard
        sources={[]}
        scoreBands={[
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
      <ResponseRateCard
        sources={[]}
        scoreBands={[
          { band: "<70", applied: 5, replied: 1 },
          { band: "70-79", applied: 5, replied: 3 },
          { band: "80-89", applied: 5, replied: 1 },
        ]}
      />,
    );
    expect(screen.getByText("No clear pattern yet.")).toBeInTheDocument();
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

  it("draws skip reason bars, all time", () => {
    wrap(
      <SkipsCard
        rows={[
          { reason: "Salary", count: 4 },
          { reason: "No reason given", count: 2 },
        ]}
        highScoreSkipped={[
          { jobId: "j1", title: "Growth Lead", employer: "Acme", score: 88 },
        ]}
      />,
    );
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("No reason given")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reconsider growth lead/i }),
    ).toBeInTheDocument();
  });

  it("says so when there is nothing to reconsider", () => {
    wrap(<SkipsCard highScoreSkipped={[]} />);
    expect(screen.getByText(/no skipped jobs scored 80/i)).toBeInTheDocument();
  });
});

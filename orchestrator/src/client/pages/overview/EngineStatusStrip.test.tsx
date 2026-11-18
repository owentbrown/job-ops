import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineStatusStrip, when } from "./EngineStatusStrip";

const daily = { enabled: true, hour: 8, days: [0, 1, 2, 3, 4, 5, 6] };
const goodRun = {
  id: "run-good",
  startedAt: "2026-11-12T13:00:00Z",
  jobsDiscovered: 46,
  jobsScored: 30,
  jobsProcessed: 12,
};

describe("EngineStatusStrip", () => {
  it("summarises the schedule, last successful run and job count", () => {
    render(
      <EngineStatusStrip
        schedule={daily}
        lastRun={{ ...goodRun, status: "completed" }}
        lastSuccessfulRun={goodRun}
        allJobsCount={742}
      />,
    );
    expect(screen.getByText(/daily .*8:00/i)).toBeInTheDocument();
    expect(screen.getByText(/last successful run/i)).toBeInTheDocument();
    expect(screen.getByText(/46 scanned/i)).toBeInTheDocument();
    expect(screen.getByText(/30 scored/i)).toBeInTheDocument();
    expect(screen.getByText(/12 ready/i)).toBeInTheDocument();
    expect(screen.getByText(/742 all jobs/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the last good counts and flags a run that reached no sites", () => {
    render(
      <EngineStatusStrip
        schedule={daily}
        lastRun={{
          id: "run-empty",
          startedAt: "2026-11-16T12:00:00Z",
          status: "completed",
          jobsDiscovered: 0,
          jobsProcessed: 0,
        }}
        lastSuccessfulRun={goodRun}
        allJobsCount={742}
      />,
    );
    expect(screen.getByText(/46 scanned/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /got nothing back from the job sites/i,
    );
  });

  it("says when a scheduled search is waiting for the internet", () => {
    render(
      <EngineStatusStrip
        schedule={{
          ...daily,
          lastScheduledRun: {
            at: "2026-11-16T12:00:00Z",
            outcome: "offline",
            message: "No internet connection.",
          },
        }}
        lastRun={null}
        lastSuccessfulRun={goodRun}
        allJobsCount={742}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/waiting/i);
  });

  it("says when no search is scheduled", () => {
    render(
      <EngineStatusStrip schedule={null} lastRun={null} allJobsCount={0} />,
    );
    expect(screen.getByText(/not scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/no successful runs yet/i)).toBeInTheDocument();
  });

  it("names today and yesterday instead of the date", () => {
    const now = new Date(2026, 10, 18, 14, 0);
    expect(when(new Date(2026, 10, 18, 6, 0).toISOString(), now)).toMatch(
      /^today at 6\sAM$/,
    );
    expect(when(new Date(2026, 10, 17, 6, 15).toISOString(), now)).toMatch(
      /^yesterday at 6:15\sAM$/,
    );
    expect(when(new Date(2026, 10, 12, 8, 0).toISOString(), now)).toMatch(
      /Nov 12/,
    );
  });
});

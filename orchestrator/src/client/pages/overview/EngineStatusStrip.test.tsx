import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineStatusStrip } from "./EngineStatusStrip";

describe("EngineStatusStrip", () => {
  it("summarises the schedule, last run and job count", () => {
    render(
      <EngineStatusStrip
        schedule={{ enabled: true, hour: 8, days: [0, 1, 2, 3, 4, 5, 6] }}
        lastRun={{
          startedAt: "2026-11-12T13:00:00Z",
          status: "completed",
          jobsDiscovered: 46,
          jobsProcessed: 12,
        }}
        allJobsCount={742}
      />,
    );
    expect(screen.getByText(/daily 8:00/i)).toBeInTheDocument();
    expect(screen.getByText(/46 found/i)).toBeInTheDocument();
    expect(screen.getByText(/12 scored/i)).toBeInTheDocument();
    expect(screen.getByText(/742 all jobs/i)).toBeInTheDocument();
  });

  it("says when no search is scheduled", () => {
    render(
      <EngineStatusStrip schedule={null} lastRun={null} allJobsCount={0} />,
    );
    expect(screen.getByText(/not scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });
});

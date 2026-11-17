import { getNotScoredLabel } from "@client/components";
import { createJob } from "@shared/testing/factories.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JobRowContent } from "./JobRowContent";

const renderRow = (job: ReturnType<typeof createJob>) =>
  render(
    <TooltipProvider>
      <JobRowContent job={job} />
    </TooltipProvider>,
  );

describe("JobRowContent score mark", () => {
  it("shows 'not scored' rather than an AI error for filtered-out jobs", () => {
    renderRow(
      createJob({
        status: "skipped",
        filterLayer: "rules",
        suitabilityScore: null,
      }),
    );
    expect(
      screen.getByRole("img", {
        name: "Not scored: filtered out before scoring.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/AI misconfiguration/)).toBeNull();
  });

  it("still flags an unscored job that should have a score", () => {
    renderRow(createJob({ status: "ready", suitabilityScore: null }));
    expect(screen.getByLabelText(/AI misconfiguration/)).toBeInTheDocument();
  });
});

describe("getNotScoredLabel", () => {
  it("explains skipped jobs and ignores scored or active ones", () => {
    expect(
      getNotScoredLabel({
        status: "skipped",
        filterLayer: null,
        suitabilityScore: null,
      }),
    ).toBe("Not scored: skipped before scoring.");
    expect(
      getNotScoredLabel({
        status: "skipped",
        filterLayer: "llm",
        suitabilityScore: 40,
      }),
    ).toBeNull();
    expect(
      getNotScoredLabel({
        status: "ready",
        filterLayer: null,
        suitabilityScore: null,
      }),
    ).toBeNull();
  });
});

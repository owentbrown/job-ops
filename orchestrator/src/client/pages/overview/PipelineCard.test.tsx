import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PipelineCard } from "./PipelineCard";

const pipeline = {
  total: 10,
  buckets: { awaiting: 6, screening: 2, interview: 0, offer: 1, rejected: 1 },
  withdrawn: 2,
};

describe("PipelineCard", () => {
  it("shows the total, a labelled bar and a legend with counts", () => {
    render(<PipelineCard pipeline={pipeline} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    const bar = screen.getByRole("img", { name: /pipeline/i });
    expect(bar).toHaveAccessibleName(
      "Pipeline: Awaiting reply 6, Screening 2, Interview 0, Offer 1, Rejected 1",
    );
    expect(screen.getByText("Awaiting reply")).toBeInTheDocument();
    expect(screen.getByText("(60%)")).toBeInTheDocument();
  });

  it("hides zero segments and notes withdrawn applications", () => {
    const { container } = render(<PipelineCard pipeline={pipeline} />);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(4);
    expect(screen.getByText("+2 withdrawn")).toBeInTheDocument();
  });

  it("shows an empty hint with no applications", () => {
    render(
      <PipelineCard
        pipeline={{
          total: 0,
          buckets: {
            awaiting: 0,
            screening: 0,
            interview: 0,
            offer: 0,
            rejected: 0,
          },
          withdrawn: 0,
        }}
      />,
    );
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });
});

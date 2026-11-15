import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobListSwiper } from "./JobListSwiper";

const items = [
  { id: "ready", label: "To apply", count: 2 },
  { id: "discovered", label: "To review", count: 14 },
  { id: "filtered", label: "Filtered out" },
  { id: "all", label: "All jobs", count: 1145 },
];

describe("JobListSwiper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const selected = () => screen.getByRole("tab", { selected: true });

  it("shows the current list in the middle with its count", () => {
    render(
      <JobListSwiper items={items} activeId="discovered" onSelect={vi.fn()} />,
    );
    expect(selected()).toHaveTextContent("To review");
    expect(selected()).toHaveTextContent("14");
  });

  it("moves to the next list and wraps around from the last", () => {
    const onSelect = vi.fn();
    render(<JobListSwiper items={items} activeId="all" onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("job-list-swiper"), {
      key: "ArrowRight",
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(onSelect).toHaveBeenCalledWith("ready");
    expect(selected()).toHaveTextContent("To apply");
  });

  it("moves back when a left-hand neighbour is tapped", () => {
    const onSelect = vi.fn();
    render(
      <JobListSwiper items={items} activeId="ready" onSelect={onSelect} />,
    );
    const neighbours = screen
      .getAllByRole("tab", { selected: false })
      .filter((el) => el.textContent?.startsWith("All jobs"));
    fireEvent.click(neighbours[neighbours.length - 1]);
    act(() => {
      vi.runAllTimers();
    });
    expect(onSelect).toHaveBeenCalledWith("all");
  });
});

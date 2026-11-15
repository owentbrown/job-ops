import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { JobsFilteredPage } from "./JobsFilteredPage";

vi.mock("./FilteredJobsPage", () => ({
  FilteredJobsPage: ({ view }: { view?: string }) => (
    <div>filtered-body:{view}</div>
  ),
}));

describe("JobsFilteredPage", () => {
  it("shows the Jobs header and tab strip with Filtered out active", () => {
    render(
      <MemoryRouter initialEntries={["/jobs/filtered"]}>
        <JobsFilteredPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Job Ops")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Job lists" });
    const link = (name: string) => within(nav).getByRole("link", { name });
    // Order: to apply, to review, filtered out, all jobs.
    expect(
      within(nav)
        .getAllByRole("link")
        .map((el) => el.textContent),
    ).toEqual(["To apply", "To review", "Filtered out", "All jobs"]);
    expect(link("To apply")).toHaveAttribute("href", "/jobs/ready");
    expect(link("To review")).toHaveAttribute("href", "/jobs/discovered");
    expect(link("All jobs")).toHaveAttribute("href", "/jobs/all");
    expect(link("Filtered out")).toHaveAttribute("aria-current", "page");
    expect(link("To apply")).not.toHaveAttribute("aria-current");
    // Phones get the swiper, showing Filtered out as the current list.
    const swiper = screen.getByTestId("job-list-swiper");
    expect(
      within(swiper).getByRole("tab", { selected: true }),
    ).toHaveTextContent("Filtered out");
    expect(screen.getByText("filtered-body:jobs")).toBeInTheDocument();
  });
});

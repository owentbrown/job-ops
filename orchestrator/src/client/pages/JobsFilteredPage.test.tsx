import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { JobsFilteredPage } from "./JobsFilteredPage";

vi.mock("@client/api", () => ({
  getPipelineStatus: vi.fn().mockResolvedValue({
    isRunning: false,
    lastRun: null,
    nextScheduledRun: null,
  }),
  runLastSearch: vi.fn(),
  getSearchSchedule: vi.fn().mockResolvedValue(null),
}));

vi.mock("@client/components/ManualImportSheet", () => ({
  ManualImportSheet: ({ open }: { open: boolean }) =>
    open ? <div>manual-import-open</div> : null,
}));

vi.mock("./orchestrator/SearchScheduleControls", () => ({
  SearchScheduleControls: () => <div>schedule-controls</div>,
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/jobs/filtered"]}>
        <JobsFilteredPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

vi.mock("./FilteredJobsPage", () => ({
  FilteredJobsPage: ({ view }: { view?: string }) => (
    <div>filtered-body:{view}</div>
  ),
}));

describe("JobsFilteredPage", () => {
  it("shows the Jobs header and tab strip with Filtered out active", () => {
    renderPage();
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

  it("has the same header buttons as the Jobs page", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: /find jobs/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("schedule-controls")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add a job/i }));
    expect(screen.getByText("manual-import-open")).toBeInTheDocument();
  });
});

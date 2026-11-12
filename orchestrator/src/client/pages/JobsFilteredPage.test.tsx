import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { JobsFilteredPage } from "./JobsFilteredPage";

vi.mock("./FilteredJobsPage", () => ({
  FilteredJobsPage: ({ view }: { view?: string }) => (
    <div>filtered-body:{view}</div>
  ),
}));

describe("JobsFilteredPage", () => {
  it("shows the Jobs header and tab strip with Filtered active", () => {
    render(
      <MemoryRouter initialEntries={["/jobs/filtered"]}>
        <JobsFilteredPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Job Ops")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Job lists" });
    const href = (name: string) =>
      screen.getByRole("link", { name }).getAttribute("href");
    expect(nav).toContainElement(
      screen.getByRole("link", { name: "Filtered" }),
    );
    expect(href("Ready")).toBe("/jobs/ready");
    expect(href("Discovered")).toBe("/jobs/discovered");
    expect(href("All Jobs")).toBe("/jobs/all");
    expect(screen.getByRole("link", { name: "Filtered" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ready" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByText("filtered-body:jobs")).toBeInTheDocument();
  });
});

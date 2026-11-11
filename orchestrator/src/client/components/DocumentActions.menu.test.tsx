import * as api from "@client/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentActions } from "./DocumentActions";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

vi.mock("@client/api", () => ({
  getJobPdfBlob: vi.fn(async () => new Blob(["resume"])),
  getCoverLetterPdfBlob: vi.fn(async () => new Blob(["letter"])),
}));

const job = {
  id: "job-1",
  pdfPath: "/pdfs/job-1.pdf",
  coverLetter: "Hi team,",
  pdfRegenerating: false,
  pdfFreshness: "current" as const,
};

describe("DocumentActions menu items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  // Menus render in order: View items first, then Download items.
  const items = (label: string) =>
    screen.getAllByRole("button", { name: new RegExp(`^${label}`) });

  it("offers resume, letter and combined for both View and Download", () => {
    render(<DocumentActions job={job} resumeFileName="x.pdf" />);
    expect(items("Resume")).toHaveLength(2);
    expect(items("Cover letter")).toHaveLength(2);
    expect(items("Combined")).toHaveLength(2);
  });

  it("fetches the right PDF for each item", async () => {
    render(<DocumentActions job={job} resumeFileName="x.pdf" />);
    fireEvent.click(items("Resume")[0]);
    await waitFor(() =>
      expect(api.getJobPdfBlob).toHaveBeenCalledWith("job-1"),
    );
    fireEvent.click(items("Cover letter")[1]);
    await waitFor(() =>
      expect(api.getCoverLetterPdfBlob).toHaveBeenCalledWith("job-1", false),
    );
    fireEvent.click(items("Combined")[1]);
    await waitFor(() =>
      expect(api.getCoverLetterPdfBlob).toHaveBeenCalledWith("job-1", true),
    );
  });

  it("disables letter items when there's no letter", () => {
    render(
      <DocumentActions
        job={{ ...job, coverLetter: null }}
        resumeFileName="x.pdf"
      />,
    );
    for (const button of items("Cover letter")) expect(button).toBeDisabled();
    for (const button of items("Combined")) expect(button).toBeDisabled();
    for (const button of items("Resume")) expect(button).toBeEnabled();
  });
});

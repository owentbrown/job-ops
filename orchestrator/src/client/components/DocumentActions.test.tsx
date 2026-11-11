import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ApplicationDocumentsBar,
  DocumentActions,
  documentFileName,
  documentUnavailableReason,
} from "./DocumentActions";

vi.mock("@client/api", () => ({
  getJobPdfBlob: vi.fn(),
  getCoverLetterPdfBlob: vi.fn(),
}));

const base = {
  id: "job-1",
  pdfPath: "/pdfs/job-1.pdf",
  coverLetter: "Hi team,\n\nHello.",
  pdfRegenerating: false,
  pdfFreshness: "current" as const,
};

describe("documentUnavailableReason", () => {
  it("allows everything when resume and letter exist", () => {
    for (const kind of ["resume", "letter", "combined"] as const) {
      expect(documentUnavailableReason(base, kind)).toBeNull();
    }
  });

  it("needs both for the combined PDF", () => {
    expect(
      documentUnavailableReason({ ...base, coverLetter: null }, "combined"),
    ).toBe("No cover letter yet");
    expect(
      documentUnavailableReason({ ...base, pdfPath: null }, "combined"),
    ).toBe("No resume PDF yet");
    expect(
      documentUnavailableReason({ ...base, pdfPath: null }, "letter"),
    ).toBe(null);
  });

  it("blocks the resume while it regenerates", () => {
    expect(
      documentUnavailableReason(
        { ...base, pdfRegenerating: true, pdfFreshness: "regenerating" },
        "resume",
      ),
    ).toBe("Resume is being regenerated");
  });
});

describe("documentFileName", () => {
  it("names the letter and combined files after the resume", () => {
    expect(documentFileName("Owen_Brown_Acme.pdf", "resume")).toBe(
      "Owen_Brown_Acme.pdf",
    );
    expect(documentFileName("Owen_Brown_Acme.pdf", "letter")).toBe(
      "Owen_Brown_Acme_Cover_Letter.pdf",
    );
    expect(documentFileName("Acme-PM-resume.pdf", "combined")).toBe(
      "Acme-PM_Application.pdf",
    );
  });
});

describe("DocumentActions", () => {
  it("shows View and Download menus", () => {
    render(<DocumentActions job={base} resumeFileName="x.pdf" />);
    expect(screen.getByRole("button", { name: /view/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled();
  });

  it("disables both menus when nothing exists yet", () => {
    render(
      <DocumentActions
        job={{ ...base, pdfPath: null, coverLetter: null }}
        resumeFileName="x.pdf"
      />,
    );
    expect(screen.getByRole("button", { name: /view/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled();
  });

  it("honours a disabled reason, e.g. unsaved letter edits", () => {
    render(
      <DocumentActions
        job={base}
        resumeFileName="x.pdf"
        disabledReason="Save your changes first"
      />,
    );
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled();
  });
});

describe("ApplicationDocumentsBar", () => {
  it("shows what's ready", () => {
    render(
      <ApplicationDocumentsBar
        job={{ ...base, coverLetter: null }}
        resumeFileName="x.pdf"
      />,
    );
    expect(screen.getByText("Application documents")).toBeInTheDocument();
    expect(screen.getByText(/Cover letter · not yet/)).toBeInTheDocument();
  });
});

import {
  DESIGN_RESUME_NAV_GROUPS,
  getSectionWorkspaceCopy,
} from "@client/components/design-resume/constants";
import type { DesignResumeDocument } from "@shared/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DesignResumePage } from "./DesignResumePage";

const draft = {
  resumeJson: {
    basics: { name: "Ada Lovelace" },
    sections: {
      experience: { items: [{ id: "e1" }, { id: "e2" }] },
    },
  },
} as unknown as DesignResumeDocument;

function makeStudio(section: string | null) {
  return {
    draft,
    dirty: false,
    saveState: "idle",
    dialogState: null,
    pictureUploading: false,
    resumeImporting: false,
    showReimportConfirm: false,
    mobileSectionPickerOpen: false,
    mobileWorkspaceView: "edit",
    pdfDownloading: false,
    rendererUpdating: false,
    settingsLoading: false,
    isLoading: false,
    error: null,
    status: { exists: true },
    activeSection: section,
    activeSectionIsValid: true,
    activeSectionMeta: getSectionWorkspaceCopy(section, draft),
    activeGroup: section
      ? DESIGN_RESUME_NAV_GROUPS.find((group) =>
          group.items.some((item) => item.id === section),
        )
      : null,
    activeDialogItem: null,
    pdfRenderer: "rxresume",
    typstTheme: "default",
    canDownloadPdf: true,
    pictureEnabled: true,
    pictureDisabledReason: null,
    fileInputRef: createRef(),
    importFileInputRef: createRef(),
    setDialogState: vi.fn(),
    setShowReimportConfirm: vi.fn(),
    setMobileSectionPickerOpen: vi.fn(),
    setMobileWorkspaceView: vi.fn(),
    updateResumeJson: vi.fn(),
    handleImport: vi.fn(),
    handleImportWithConfirm: vi.fn(),
    handleImportFile: vi.fn(),
    handleExport: vi.fn(),
    handleDownloadPdf: vi.fn(),
    handleUploadPicture: vi.fn(),
    handleDeletePicture: vi.fn(),
    handlePdfRendererChange: vi.fn(),
    handleTypstThemeChange: vi.fn(),
    handleMobileSectionSelect: vi.fn(),
    getDesignResumeSectionBadge: (sectionId: string) =>
      sectionId === "experience" ? { label: "2", variant: "outline" } : null,
  };
}

vi.mock("@client/hooks/useDesignResumeStudio", async () => {
  const { useParams } = await import("react-router-dom");
  return {
    useDesignResumeStudio: () => {
      const { section } = useParams<{ section?: string }>();
      return makeStudio(section ?? null);
    },
  };
});
vi.mock("@client/components/design-resume/DesignResumeRail", () => ({
  DesignResumeRail: ({ activeSectionId }: { activeSectionId: string }) => (
    <div>editor:{activeSectionId}</div>
  ),
}));
vi.mock("@client/components/design-resume/DesignResumePreviewPanel", () => ({
  DesignResumePreviewPanel: () => <div>resume-preview</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/profile/studio/resume"
          element={
            <>
              <DesignResumePage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/profile/studio/resume/:section"
          element={
            <>
              <DesignResumePage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("DesignResumePage", () => {
  it("writes out the section names in the desktop section list", () => {
    renderAt("/profile/studio/resume/experience");

    const nav = screen.getByRole("navigation", {
      name: "Resume Studio sections",
    });
    expect(
      within(nav).getByRole("button", { name: /^Contact/ }),
    ).toBeInTheDocument();
    const experience = within(nav).getByRole("button", {
      name: /^Experience/,
    });
    expect(experience).toHaveAttribute("aria-current", "page");
    expect(experience).toHaveTextContent("2");
    expect(
      within(nav).queryByRole("button", { name: /Live preview/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("editor:experience")).toBeInTheDocument();
    expect(screen.getByText("resume-preview")).toBeInTheDocument();
  });

  it("navigates to the section route when a labelled section is clicked", () => {
    renderAt("/profile/studio/resume/experience");

    const nav = screen.getByRole("navigation", {
      name: "Resume Studio sections",
    });
    fireEvent.click(within(nav).getByRole("button", { name: /^Skills/ }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/profile/studio/resume/skills",
    );
    expect(screen.getByText("editor:skills")).toBeInTheDocument();
  });

  it("keeps the base route and asks for a section when none is selected", () => {
    renderAt("/profile/studio/resume");

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/profile/studio/resume",
    );
    expect(
      screen.getByRole("navigation", { name: "Resume Studio sections" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { name: "Choose a section to edit" })
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("resume-preview")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProfileStudioPage } from "./ProfileStudioPage";

vi.mock("../DesignResumePage", () => ({
  DesignResumePage: ({ toolbar }: { toolbar?: React.ReactNode }) => (
    <div>
      {toolbar}
      resume-studio
    </div>
  ),
}));
vi.mock("./CoverLetterStudio", () => ({
  CoverLetterStudio: ({ switcher }: { switcher?: React.ReactNode }) => (
    <div>
      {switcher}
      cover-letter-studio
    </div>
  ),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/studio/:doc" element={<ProfileStudioPage />} />
        <Route
          path="/profile/studio/:doc/:section"
          element={<ProfileStudioPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("ProfileStudioPage", () => {
  it("shows the resume editor with the switch", () => {
    renderAt("/profile/studio/resume");
    expect(screen.getByText("resume-studio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cover letter" })).toHaveAttribute(
      "href",
      "/profile/studio/cover-letter",
    );
  });

  it("keeps a resume section in the URL", () => {
    renderAt("/profile/studio/resume/basics");
    expect(screen.getByText("resume-studio")).toBeInTheDocument();
  });

  it("shows the cover letter studio with the switch", () => {
    renderAt("/profile/studio/cover-letter");
    expect(screen.getByText("cover-letter-studio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/profile/studio/resume",
    );
  });
});

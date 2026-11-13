import { useProfileInsights } from "@client/hooks/useProfileInsights";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AboutYouPage } from "./AboutYouPage";
import { makeInsights } from "./about/insightsFixture";

vi.mock("@client/hooks/useProfileInsights", () => ({
  useProfileInsights: vi.fn(),
}));

// Sheets have their own tests; here we only check which one opens.
const { stub } = vi.hoisted(() => ({
  stub:
    (name: string) =>
    (p: { open: boolean; storyId?: string | null; autoWrite?: boolean }) =>
      p.open
        ? `${name}${p.storyId ? `:${p.storyId}` : ""}${p.autoWrite ? ":ai" : ""}`
        : null,
}));
vi.mock("./about/BrandSheet", () => ({ BrandSheet: stub("brand-sheet") }));
vi.mock("./about/PitchSheet", () => ({ PitchSheet: stub("pitch-sheet") }));
vi.mock("./about/StorySheet", () => ({ StorySheet: stub("story-sheet") }));
vi.mock("./about/ValuesSheet", () => ({ ValuesSheet: stub("values-sheet") }));
vi.mock("./about/SkillsSheet", () => ({ SkillsSheet: stub("skills-sheet") }));
vi.mock("@client/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
  PageMain: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

function mockInsights(value: Partial<ReturnType<typeof useProfileInsights>>) {
  vi.mocked(useProfileInsights).mockReturnValue({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
    ...value,
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<AboutYouPage />} />
        <Route path="/profile/studio/resume" element={<p>resume studio</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AboutYouPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton cards while loading", () => {
    mockInsights({ isLoading: true });
    renderPage();
    expect(screen.getByLabelText("Loading your profile")).toBeInTheDocument();
    expect(
      screen.getByText("Your documents are built from this page"),
    ).toBeInTheDocument();
  });

  it("composes every card from ok insights", () => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    for (const name of [
      "Your brand",
      "Elevator pitch",
      "Skill map",
      "Roles that fit you",
      "Story bank",
      "What drives you",
      "How you're landing",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("img", { name: "Profile strength 63 out of 100" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open resume" })).toHaveAttribute(
      "href",
      "/profile/studio/resume",
    );
  });

  it("shows too-early states without fake data", () => {
    mockInsights({ data: makeInsights("too-early") });
    renderPage();
    expect(
      screen.getAllByText(
        "Too early. These fill in after your first searches.",
      ),
    ).toHaveLength(2);
    expect(screen.getByText(/No applications yet/)).toBeInTheDocument();
  });

  it("points to Document Studio when there is no resume", () => {
    mockInsights({ data: makeInsights("no-resume") });
    renderPage();
    expect(
      screen.getByRole("link", { name: /Import your resume/ }),
    ).toHaveAttribute("href", "/profile/studio/resume");
    expect(screen.queryByRole("heading", { name: "Your brand" })).toBeNull();
  });

  it("opens the strength sheet from the ring and routes fixes", () => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "See how it's scored" }),
    );
    expect(
      screen.getByRole("heading", { name: "How your profile is scored" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Add a story (Story coverage)" }),
    );
    expect(
      screen.queryByRole("heading", { name: "How your profile is scored" }),
    ).toBeNull();
    expect(screen.getByText("story-sheet")).toBeInTheDocument();
  });

  it("sends edit-resume to Document Studio", () => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "See how it's scored" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit resume (Results in experience)",
      }),
    );
    expect(screen.getByText("resume studio")).toBeInTheDocument();
  });

  it.each([
    ["Edit brand", "brand-sheet"],
    ["Edit pitch", "pitch-sheet"],
    ["Rewrite with AI", "pitch-sheet:ai"],
    ["Add story", "story-sheet"],
    ["Edit values", "values-sheet"],
    ["Edit skills", "skills-sheet"],
    ["Refresh with AI", "skills-sheet"],
  ])("%s opens %s", (button, sheet) => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    expect(screen.queryByText(sheet)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByText(sheet)).toBeInTheDocument();
  });

  it("opens a saved story for editing", () => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Funded the roadmap/ }));
    expect(screen.getByText("story-sheet:st2")).toBeInTheDocument();
  });

  it("offers a retry when insights fail", () => {
    const refetch = vi.fn();
    mockInsights({ data: undefined, refetch } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

import {
  useProfileInsights,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AboutYouPage } from "./AboutYouPage";
import { makeInsights } from "./about/insightsFixture";

vi.mock("@client/hooks/useProfileInsights", () => ({
  useProfileInsights: vi.fn(),
  useProfileMutations: vi.fn(),
}));
vi.mock("@client/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
  PageMain: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

const refreshMutate = vi.fn();

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
    vi.mocked(useProfileMutations).mockReturnValue({
      refreshSkills: { mutate: refreshMutate, isPending: false },
    } as never);
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
    const { container } = renderPage();
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
    expect(
      container.querySelector("[data-open-panel='add-story']"),
    ).not.toBeNull();
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

  it("refreshes skills with AI", () => {
    mockInsights({ data: makeInsights("ok") });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Refresh with AI" }));
    expect(refreshMutate).toHaveBeenCalled();
  });

  it("offers a retry when insights fail", () => {
    const refetch = vi.fn();
    mockInsights({ data: undefined, refetch } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

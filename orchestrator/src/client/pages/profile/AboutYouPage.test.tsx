import { useDesignResume } from "@client/hooks/useDesignResume";
import { useSettings } from "@client/hooks/useSettings";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AboutYouPage } from "./AboutYouPage";

vi.mock("@client/hooks/useDesignResume", () => ({ useDesignResume: vi.fn() }));
vi.mock("@client/hooks/useSettings", () => ({ useSettings: vi.fn() }));
vi.mock("@client/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
  PageMain: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

const resume = {
  resumeJson: {
    basics: {
      name: "Sample Person",
      headline: "Strategy lead",
      location: "Kitchener, ON",
    },
    summary: {
      content: "<p>Turns <strong>fuzzy</strong> problems into plans.</p>",
    },
    sections: {
      skills: {
        items: [
          { id: "a", hidden: false, name: "Business cases" },
          { id: "b", hidden: true, name: "Hidden skill" },
        ],
      },
    },
  },
};

describe("AboutYouPage", () => {
  beforeEach(() => {
    vi.mocked(useSettings).mockReturnValue({
      settings: {
        searchTerms: { value: ["Product Manager", "Product Strategy"] },
      },
      isLoading: false,
    } as never);
  });

  it("shows headline, summary text, visible strengths and target roles", () => {
    vi.mocked(useDesignResume).mockReturnValue({
      document: resume,
      isLoading: false,
    } as never);
    render(
      <MemoryRouter>
        <AboutYouPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Strategy lead" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Turns fuzzy problems into plans."),
    ).toBeInTheDocument();
    expect(screen.getByText("Business cases")).toBeInTheDocument();
    expect(screen.queryByText("Hidden skill")).toBeNull();
    expect(screen.getByText("Product Manager")).toBeInTheDocument();
    expect(screen.getByText("Kitchener, ON")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open resume" })).toHaveAttribute(
      "href",
      "/profile/studio/resume",
    );
  });

  it("points to Document Studio when there is no resume", () => {
    vi.mocked(useDesignResume).mockReturnValue({
      document: null,
      isLoading: false,
    } as never);
    render(
      <MemoryRouter>
        <AboutYouPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Import your resume/ }),
    ).toHaveAttribute("href", "/profile/studio/resume");
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BrandBanner } from "./BrandBanner";
import { makeInsights } from "./insightsFixture";
import { LandingCard } from "./LandingCard";
import { PitchCard } from "./PitchCard";
import { RolesCard } from "./RolesCard";
import { SkillMapCard } from "./SkillMapCard";
import { StoryBankCard } from "./StoryBankCard";
import { StrengthSheet } from "./StrengthSheet";
import { ValuesCard } from "./ValuesCard";

const withRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("BrandBanner", () => {
  it("shows initials, line, chips and a labelled strength ring", () => {
    const data = makeInsights("ok");
    const onEdit = vi.fn();
    const onOpenStrength = vi.fn();
    render(
      <BrandBanner
        brand={data.brand}
        strength={data.strength}
        bestFitJobCount={data.bestFitJobCount}
        onEdit={onEdit}
        onOpenStrength={onOpenStrength}
      />,
    );
    expect(screen.getByText("SP")).toBeInTheDocument();
    expect(
      screen.getByText(/turns fuzzy problems into funded plans/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Product Manager · Product Strategy"),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchener, ON")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Profile strength 63 out of 100" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Scored against 31 best-fit jobs"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "See how it's scored" }),
    );
    expect(onOpenStrength).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit brand" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "edit-brand" });
  });

  it("asks for a brand line when there is none", () => {
    const data = makeInsights("ok");
    render(
      <BrandBanner
        brand={{ ...data.brand, line: null, lineSource: "none" }}
        strength={data.strength}
        bestFitJobCount={0}
        onEdit={vi.fn()}
        onOpenStrength={vi.fn()}
      />,
    );
    expect(screen.getByText(/Add a one-line brand/)).toBeInTheDocument();
    expect(screen.getByText("Scored against your resume")).toBeInTheDocument();
  });
});

describe("StrengthSheet", () => {
  it("lists the six checks and fix buttons call onEdit with the action", () => {
    const data = makeInsights("ok");
    const onEdit = vi.fn();
    render(
      <StrengthSheet
        open
        onOpenChange={vi.fn()}
        strength={data.strength}
        onEdit={onEdit}
      />,
    );
    const list = screen.getByRole("list", { name: "Strength checks" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("6.7 / 20")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit resume (Results in experience)",
      }),
    );
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "edit-resume" });
    fireEvent.click(
      screen.getByRole("button", { name: "Add a story (Story coverage)" }),
    );
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "add-story" });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit pitch (Pitch and values)" }),
    );
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "edit-pitch" });
    // Full checks have no fix button.
    expect(screen.queryByRole("button", { name: /\(Basics\)/ })).toBeNull();
  });
});

describe("PitchCard", () => {
  it("switches between 15, 30 and 60 second versions", () => {
    const { pitch } = makeInsights("ok");
    render(<PitchCard pitch={pitch} onEdit={vi.fn()} />);
    expect(
      screen.getByText(
        "I turn fuzzy problems into funded plans, then deliver them.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30s" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "15s" }));
    expect(
      screen.getByText("I turn fuzzy problems into funded plans."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15s" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "60s" }));
    expect(screen.getByText(/No 60-second version yet/)).toBeInTheDocument();
  });

  it("shows built-from chips", () => {
    const { pitch } = makeInsights("ok");
    render(<PitchCard pitch={pitch} onEdit={vi.fn()} />);
    expect(screen.getByText("Built from")).toBeInTheDocument();
    expect(screen.getByText("Cut call volume")).toBeInTheDocument();
    expect(screen.getByText("Ownership")).toBeInTheDocument();
  });

  it("shows the empty state and opens the pitch panel", () => {
    const onEdit = vi.fn();
    render(
      <PitchCard
        pitch={{
          s15: "",
          s30: "",
          s60: "",
          builtFrom: { stories: [], values: [] },
          isEmpty: true,
        }}
        onEdit={onEdit}
      />,
    );
    expect(screen.queryByRole("group", { name: "Pitch length" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write your pitch" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "edit-pitch" });
  });
});

describe("SkillMapCard", () => {
  const props = (state: "ok" | "too-early" | "no-resume") => {
    const data = makeInsights(state);
    return {
      dataState: data.dataState,
      skills: data.skills,
      bestFitJobCount: data.bestFitJobCount,
      refreshedAt: data.skillsRefreshedAt,
    };
  };

  it("plots skills with quadrant labels, explanation and a screen-reader list", () => {
    const onEdit = vi.fn();
    render(<SkillMapCard {...props("ok")} onEdit={onEdit} />);
    for (const label of [
      "Lead with these",
      "Prove these",
      "Hidden strengths",
      "Nice to have",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByText(/31 best-fit jobs that mention it/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\(Cross-functional alignment: 81%\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Skills to prove next" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AI/ML: 62% of best-fit jobs, proof 0.5 of 3"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit skills" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "edit-skills" });
    onEdit.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Refresh with AI" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "edit-skills" });
  });

  it("says too early with no fake data", () => {
    render(<SkillMapCard {...props("too-early")} onEdit={vi.fn()} />);
    expect(
      screen.getByText("Too early. These fill in after your first searches."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lead with these")).toBeNull();
  });

  it("points to the resume when there is none", () => {
    render(<SkillMapCard {...props("no-resume")} onEdit={vi.fn()} />);
    expect(screen.getByText(/Import your resume/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh with AI" }),
    ).toBeNull();
  });
});

describe("RolesCard", () => {
  it("shows role tiles with fit, tag, why, gap and a jobs link", () => {
    const data = makeInsights("ok");
    withRouter(<RolesCard dataState="ok" roles={data.roles} />);
    expect(screen.getByText("Product Manager / Owner")).toBeInTheDocument();
    expect(screen.getByText("Core fit")).toBeInTheDocument();
    expect(screen.getByText("Stretch")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Fit 72 out of 100" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs proof for AI/ML.")).toBeInTheDocument();
    expect(screen.getByText("5 open in your feed")).toBeInTheDocument();
    // Only roles with open jobs get a link; Jobs has no family filter.
    expect(screen.getByRole("link", { name: "See jobs" })).toHaveAttribute(
      "href",
      "/jobs/ready",
    );
  });

  it.each(["too-early", "no-resume"] as const)("is empty when %s", (state) => {
    withRouter(<RolesCard dataState={state} roles={[]} />);
    expect(
      screen.getByText("Too early. These fill in after your first searches."),
    ).toBeInTheDocument();
  });
});

describe("StoryBankCard", () => {
  it("shows theme counts, dashed gaps and top stories", () => {
    const onEdit = vi.fn();
    const { stories } = makeInsights("ok");
    render(<StoryBankCard stories={stories} onEdit={onEdit} />);
    const themes = screen.getByRole("list", { name: "Stories by theme" });
    expect(within(themes).getAllByRole("listitem")).toHaveLength(6);
    expect(within(themes).getAllByText("no stories yet")).toHaveLength(4);
    expect(screen.getByText("2 saved stories")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cut call volume/ }));
    expect(onEdit).toHaveBeenCalledWith({
      kind: "edit-story",
      storyId: "st1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Add story" }));
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "add-story" });
  });

  it("shows an empty state with no stories", () => {
    const { stories } = makeInsights("ok");
    render(
      <StoryBankCard
        stories={{
          total: 0,
          top: [],
          themes: stories.themes.map((t) => ({ ...t, count: 0 })),
        }}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("None written yet")).toBeInTheDocument();
    expect(screen.getByText(/short stories you can tell/)).toBeInTheDocument();
  });
});

describe("ValuesCard", () => {
  it("shows starred values first and the ideal-role scales", () => {
    const { values } = makeInsights("ok");
    render(<ValuesCard values={values} onEdit={vi.fn()} />);
    const items = within(
      screen.getByRole("list", { name: "Values" }),
    ).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Starred: Ownership");
    expect(
      screen.getByRole("img", { name: "Startup to Enterprise: 70 of 100" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Remote to In office: 20 of 100" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state that opens the values panel", () => {
    const onEdit = vi.fn();
    render(<ValuesCard values={{ items: [], ideal: null }} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your values" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "edit-values" });
  });
});

describe("LandingCard", () => {
  it("shows applications, best fit and the focus warning", () => {
    const { landing } = makeInsights("ok");
    render(<LandingCard landing={landing} />);
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Average fit 61")).toBeInTheDocument();
    expect(screen.getByText("Strategy Lead at Acme")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(
      screen.getByText(/low-fit roles \(Growth \/ GTM\)/),
    ).toBeInTheDocument();
  });

  it("is empty with no applications", () => {
    const { landing } = makeInsights("too-early");
    render(<LandingCard landing={landing} />);
    expect(screen.getByText(/No applications yet/)).toBeInTheDocument();
  });
});

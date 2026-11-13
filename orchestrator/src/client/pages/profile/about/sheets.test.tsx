import { ApiClientError } from "@client/api/core";
import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import type { ProfileEntriesResponse } from "@shared/types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandSheet } from "./BrandSheet";
import { PitchSheet, wordHint } from "./PitchSheet";
import { SkillsSheet } from "./SkillsSheet";
import { StorySheet } from "./StorySheet";
import { ValuesSheet } from "./ValuesSheet";

vi.mock("@client/hooks/useProfileInsights", () => ({
  useProfileEntries: vi.fn(),
  useProfileMutations: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const story = {
  title: "Cut call volume",
  themes: ["delivery" as const],
  situation: "Calls were rising",
  task: "Reduce them",
  action: "Rebuilt the journey",
  result: "100K fewer calls",
  metric: "100K",
  source: "manual" as const,
};

const entries: ProfileEntriesResponse = {
  brand: { line: "Ops lead", industries: ["Insurance"] },
  pitch: {
    s15: "Short pitch",
    s30: "",
    s60: "",
    builtFrom: { storyIds: [], values: [] },
  },
  values: {
    items: [{ label: "Ownership", starred: false }],
    ideal: { size: 50, management: 50, office: 50 },
  },
  skills: null,
  stories: [
    {
      id: "st1",
      kind: "story",
      data: story,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
  ],
};

type Mut = { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
const mut = (): Mut => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});
let m: Record<
  "saveEntry" | "createStory" | "updateStory" | "deleteStory" | "refreshSkills",
  Mut
>;

beforeEach(() => {
  vi.clearAllMocks();
  m = {
    saveEntry: mut(),
    createStory: mut(),
    updateStory: mut(),
    deleteStory: mut(),
    refreshSkills: mut(),
  };
  vi.mocked(useProfileMutations).mockImplementation(() => m as never);
  vi.mocked(useProfileEntries).mockReturnValue({
    data: entries,
    isError: false,
    refetch: vi.fn(),
  } as never);
});

const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("BrandSheet", () => {
  it("saves the line and industries, then closes", async () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <BrandSheet
          open
          onOpenChange={onOpenChange}
          targetRoles={["Product Manager"]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Product Manager")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Change them in Jobs" }),
    ).toHaveAttribute("href", "/jobs/ready");

    fireEvent.change(screen.getByLabelText("Brand line"), {
      target: { value: "  New line  " },
    });
    const industry = screen.getByLabelText("Industries");
    fireEvent.change(industry, { target: { value: "AI products" } });
    fireEvent.keyDown(industry, { key: "Enter" });
    save();

    await waitFor(() =>
      expect(m.saveEntry.mutateAsync).toHaveBeenCalledWith({
        kind: "brand",
        data: { line: "New line", industries: ["Insurance", "AI products"] },
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Brand saved");
  });

  it("shows a length error inline", () => {
    render(
      <MemoryRouter>
        <BrandSheet open onOpenChange={vi.fn()} targetRoles={[]} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Brand line"), {
      target: { value: "x".repeat(401) },
    });
    save();
    expect(
      screen.getByText("Keep this under 400 characters."),
    ).toBeInTheDocument();
    expect(m.saveEntry.mutateAsync).not.toHaveBeenCalled();
  });

  it("prefills the headline when no brand is saved", () => {
    vi.mocked(useProfileEntries).mockReturnValue({
      data: { ...entries, brand: null },
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(
      <MemoryRouter>
        <BrandSheet
          open
          onOpenChange={vi.fn()}
          targetRoles={[]}
          fallbackLine="Strategy lead"
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Brand line")).toHaveValue("Strategy lead");
  });
});

describe("PitchSheet", () => {
  it("saves three lengths and built-from links", async () => {
    render(<PitchSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByText("2 words · aim for about 40")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("30-second pitch"), {
      target: { value: "A thirty second pitch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cut call volume" }));
    fireEvent.click(screen.getByRole("button", { name: "Ownership" }));
    save();
    await waitFor(() =>
      expect(m.saveEntry.mutateAsync).toHaveBeenCalledWith({
        kind: "pitch",
        data: {
          s15: "Short pitch",
          s30: "A thirty second pitch",
          s60: "",
          builtFrom: { storyIds: ["st1"], values: ["Ownership"] },
        },
      }),
    );
  });

  it("gently flags a long pitch", () => {
    expect(wordHint("word ".repeat(60), 40)).toMatch(/A little long/);
    expect(wordHint("", 40)).toBe("0 words · aim for about 40");
  });
});

describe("StorySheet", () => {
  it("requires a title, then creates the story", async () => {
    const onOpenChange = vi.fn();
    render(<StorySheet open onOpenChange={onOpenChange} />);
    save();
    expect(screen.getByText("This can't be empty.")).toBeInTheDocument();
    expect(m.createStory.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Launched pricing" },
    });
    // Themes are saved in display order whatever the click order.
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    fireEvent.change(screen.getByLabelText("Result"), {
      target: { value: "Revenue up" },
    });
    fireEvent.change(screen.getByLabelText("Result metric"), {
      target: { value: "+12%" },
    });
    save();
    await waitFor(() =>
      expect(m.createStory.mutateAsync).toHaveBeenCalledWith({
        title: "Launched pricing",
        themes: ["delivery", "analytics"],
        situation: "",
        task: "",
        action: "",
        result: "Revenue up",
        metric: "+12%",
        source: "manual",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("updates an existing story with an empty metric as null", async () => {
    render(<StorySheet open onOpenChange={vi.fn()} storyId="st1" />);
    expect(screen.getByLabelText("Title")).toHaveValue("Cut call volume");
    fireEvent.change(screen.getByLabelText("Result metric"), {
      target: { value: "" },
    });
    save();
    await waitFor(() =>
      expect(m.updateStory.mutateAsync).toHaveBeenCalledWith({
        id: "st1",
        data: { ...story, metric: null },
      }),
    );
  });

  it("asks for confirmation before deleting", async () => {
    const onOpenChange = vi.fn();
    render(<StorySheet open onOpenChange={onOpenChange} storyId="st1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete story" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete this story?")).toBeInTheDocument();
    expect(m.deleteStory.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(m.deleteStory.mutateAsync).toHaveBeenCalledWith("st1"),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the story when the confirm is cancelled", () => {
    render(<StorySheet open onOpenChange={vi.fn()} storyId="st1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete story" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(m.deleteStory.mutateAsync).not.toHaveBeenCalled();
  });

  it("says when a story no longer exists", () => {
    render(<StorySheet open onOpenChange={vi.fn()} storyId="gone" />);
    expect(
      screen.getByText("This story no longer exists."),
    ).toBeInTheDocument();
  });
});

describe("ValuesSheet", () => {
  it("stars, adds and removes values and saves the sliders", async () => {
    render(<ValuesSheet open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Star Ownership" }));
    const input = screen.getByLabelText("What matters to you");
    fireEvent.change(input, { target: { value: "Learning" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "Prestige" } });
    fireEvent.click(screen.getByRole("button", { name: "Add value" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Prestige" }));

    const size = screen.getByLabelText("Startup to Enterprise");
    expect(size).toHaveAttribute("type", "range");
    fireEvent.change(size, { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Remote to In office"), {
      target: { value: "10" },
    });
    save();
    await waitFor(() =>
      expect(m.saveEntry.mutateAsync).toHaveBeenCalledWith({
        kind: "values",
        data: {
          items: [
            { label: "Ownership", starred: true },
            { label: "Learning", starred: false },
          ],
          ideal: { size: 80, management: 50, office: 10 },
        },
      }),
    );
  });
});

describe("SkillsSheet", () => {
  it("starts from the starter list and saves renames and hides as user edits", async () => {
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    const names = screen.getAllByLabelText("Name");
    expect(names).toHaveLength(16);
    fireEvent.change(names[0], { target: { value: "Alignment" } });
    fireEvent.click(
      screen.getAllByRole("switch", { name: "Show on skill map" })[1],
    );
    save();
    await waitFor(() => expect(m.saveEntry.mutateAsync).toHaveBeenCalled());
    const [{ kind, data }] = m.saveEntry.mutateAsync.mock.calls[0];
    expect(kind).toBe("skills");
    expect(data.items).toHaveLength(16);
    expect(data.items[0]).toMatchObject({
      id: "cross-functional",
      label: "Alignment",
      source: "user",
    });
    expect(data.items[1]).toMatchObject({ hidden: true, source: "starter" });
    expect(data.refreshedAt).toBeNull();
  });

  it("adds a skill", async () => {
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText("Add a skill");
    fireEvent.change(input, { target: { value: "Vendor management" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    save();
    await waitFor(() => expect(m.saveEntry.mutateAsync).toHaveBeenCalled());
    const { data } = m.saveEntry.mutateAsync.mock.calls[0][0];
    expect(data.items.at(-1)).toEqual({
      id: "user-vendor-management",
      label: "Vendor management",
      keywords: ["Vendor management"],
      hidden: false,
      source: "user",
    });
  });

  it("shows an inline error for an empty name", () => {
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getAllByLabelText("Name")[2], {
      target: { value: "  " },
    });
    save();
    expect(screen.getByText("This can't be empty.")).toBeInTheDocument();
    expect(m.saveEntry.mutateAsync).not.toHaveBeenCalled();
  });

  it("refreshes with AI and shows the new list", async () => {
    m.refreshSkills.mutateAsync.mockResolvedValue({
      skills: {
        items: [
          {
            id: "ai-sql",
            label: "SQL",
            keywords: ["SQL"],
            hidden: false,
            source: "ai",
          },
        ],
        refreshedAt: "2026-11-12T09:00:00.000Z",
      },
      added: 1,
      updated: 0,
      jobsUsed: 30,
    });
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Not refreshed yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh with AI" }));
    await waitFor(() =>
      expect(screen.getAllByLabelText("Name")).toHaveLength(1),
    );
    expect(m.refreshSkills.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Last refreshed/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      "Skills refreshed from 30 jobs: 1 new, 0 updated",
    );
  });

  it("shows the busy state while refreshing", () => {
    m.refreshSkills.isPending = true;
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(screen.getByText(/Reading job descriptions/)).toBeInTheDocument();
  });

  it("asks to save edits before refreshing", () => {
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getAllByLabelText("Name")[0], {
      target: { value: "Alignment" },
    });
    expect(
      screen.getByRole("button", { name: "Refresh with AI" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Save your changes before refreshing."),
    ).toBeInTheDocument();
  });

  it.each([
    [409, /already running/],
    [502, /The AI didn't respond/],
    [400, /Run a job search first/],
  ])("explains a %i from the refresh", async (status, message) => {
    m.refreshSkills.mutateAsync.mockRejectedValue(
      new ApiClientError("server text", { status }),
    );
    render(<SkillsSheet open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh with AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

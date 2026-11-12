import type { PrefilterConfigDto } from "@client/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { FilteredJobsPage } from "./FilteredJobsPage";

vi.mock("../api", () => ({
  getFilteredJobs: vi.fn(),
  restoreFilteredJob: vi.fn(),
  getPrefilterConfig: vi.fn(),
  savePrefilterConfig: vi.fn(),
  previewPrefilter: vi.fn(),
  scoreBacklog: vi.fn(),
  resumePipelineScoring: vi.fn(),
}));

const config: PrefilterConfigDto = {
  enabled: true,
  pauseBeforeScoring: true,
  title: { include: ["growth"], exclude: ["analyst", "intern"] },
  companyBlocklist: [],
  maxPostingAgeDays: null,
  location: { commuteBlocklist: [], dropUsOnly: true },
  companyNotes: [],
  salary: {
    enabled: true,
    floorAnnualCad: 110000,
    hoursPerYear: 2080,
    defaultCurrency: "CAD",
    ratesToCad: { CAD: 1 },
  },
  language: {
    enabled: true,
    dropNonEnglishPostings: true,
    blockedLanguages: ["French"],
  },
  description: { hardDropPhrases: [], flagPhrases: [] },
  llm: {
    enabled: false,
    batchSize: 20,
    descriptionChars: 400,
    model: null,
    targetRoles: "",
    hardPasses: "",
  },
};

describe("FilteredJobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getFilteredJobs).mockResolvedValue({ jobs: [] });
    vi.mocked(api.getPrefilterConfig).mockResolvedValue({
      status: "ok",
      path: "/repo/config/prefilter.json",
      config,
      error: null,
      defaults: config,
    });
    vi.mocked(api.previewPrefilter).mockResolvedValue({
      total: 3,
      counts: { drop: 1, keep: 1, undecided: 1 },
      items: [
        {
          id: "a",
          title: "Data Analyst",
          employer: "Acme",
          location: null,
          decision: "drop",
          detail: "title: analyst",
        },
      ],
    });
  });

  const renderPage = (ui: React.ReactElement = <FilteredJobsPage />) =>
    renderWithQueryClient(<MemoryRouter>{ui}</MemoryRouter>);

  it("shows the rules form from config and the preview counts", async () => {
    renderPage();

    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Rules" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
    const exclude = (await screen.findByLabelText(
      /Drop \(exclude\)/,
    )) as HTMLTextAreaElement;
    expect(exclude.value).toBe("analyst\nintern");

    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    expect(await screen.findByText(/1 dropped by rules/)).toBeInTheDocument();
    expect(api.previewPrefilter).toHaveBeenCalledWith(config);
  });

  it("requires a second click to start the backlog run", async () => {
    vi.mocked(api.scoreBacklog).mockResolvedValue({ started: true });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Filter & score backlog" }),
    );
    expect(api.scoreBacklog).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /Click again to start/ }),
    );
    await waitFor(() => expect(api.scoreBacklog).toHaveBeenCalledOnce());
  });

  const openRules = async () => {
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Rules" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
  };

  it("shows an error state with Retry when the config fails to load", async () => {
    vi.mocked(api.getPrefilterConfig).mockRejectedValueOnce(
      new Error("Pre-score filter is unavailable in hosted mode."),
    );
    renderPage();
    await openRules();
    expect(await screen.findByRole("alert")).toHaveTextContent(/hosted mode/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByLabelText(/Drop \(exclude\)/),
    ).toBeInTheDocument();
  });

  it("auto-disarms the backlog confirm after 5 seconds", async () => {
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Filter & score backlog",
    });
    vi.useFakeTimers();
    try {
      fireEvent.click(button);
      expect(
        screen.getByRole("button", { name: /Click again to start/ }),
      ).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(
        screen.getByRole("button", { name: "Filter & score backlog" }),
      ).toBeInTheDocument();
      expect(api.scoreBacklog).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when there is no paused run to resume", async () => {
    vi.mocked(api.resumePipelineScoring).mockResolvedValue({
      resolved: false,
    });
    renderPage();
    await openRules();
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume paused run" }),
    );
    expect(
      await screen.findByText("No paused run to resume."),
    ).toBeInTheDocument();
  });

  it("keeps edits across tab switches and blocks the backlog run while dirty", async () => {
    renderPage();
    await openRules();
    const exclude = (await screen.findByLabelText(
      /Drop \(exclude\)/,
    )) as HTMLTextAreaElement;
    fireEvent.change(exclude, { target: { value: "analyst\nsales" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(
      screen.getByText("Save your rule changes first"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filter & score backlog" }),
    ).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Filtered jobs/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Filtered jobs/ }));
    await openRules();
    expect(
      (screen.getByLabelText(/Drop \(exclude\)/) as HTMLTextAreaElement).value,
    ).toBe("analyst\nsales");
  });

  it("saves the edited draft and preserves comments", async () => {
    const withComment = { ...config, _comment: "keep me" };
    vi.mocked(api.getPrefilterConfig).mockResolvedValue({
      status: "ok",
      path: "/repo/config/prefilter.json",
      config: withComment,
      error: null,
      defaults: withComment,
    });
    vi.mocked(api.savePrefilterConfig).mockImplementation(async (c) => ({
      config: c,
      path: "/repo/config/prefilter.json",
    }));
    renderPage();
    await openRules();
    fireEvent.change(await screen.findByLabelText(/Drop \(exclude\)/), {
      target: { value: "analyst\nsales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(api.savePrefilterConfig).toHaveBeenCalled());
    const sent = vi.mocked(api.savePrefilterConfig).mock.calls[0][0];
    expect(sent._comment).toBe("keep me");
    expect(sent.title.exclude).toEqual(["analyst", "sales"]);
    await waitFor(() =>
      expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument(),
    );
  });

  it("shows an inline error and disables Save for an invalid number", async () => {
    renderPage();
    await openRules();
    fireEvent.change(await screen.findByLabelText(/Floor/), {
      target: { value: "abc" },
    });
    expect(screen.getByText("Floor must be a number.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Preview/ })).toBeDisabled();
  });

  it("shows only the list and a link to the rules when view is jobs", async () => {
    renderPage(<FilteredJobsPage view="jobs" />);
    expect(await screen.findByText(/Filtered jobs/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Rules" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Edit filter rules/ }),
    ).toHaveAttribute("href", "/settings#prefilter");
    expect(
      screen.queryByRole("button", { name: "Filter & score backlog" }),
    ).toBeNull();
  });

  it("shows only the rules editor when view is rules", async () => {
    renderPage(<FilteredJobsPage view="rules" />);
    expect(screen.queryByRole("tab", { name: /Filtered jobs/ })).toBeNull();
    expect(
      await screen.findByTestId("prefilter-rules-editor"),
    ).toBeInTheDocument();
  });
});

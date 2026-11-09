import type { PrefilterConfigDto } from "@client/api";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  location: { commuteBlocklist: [] },
  salary: {
    enabled: true,
    floorAnnualCad: 110000,
    hoursPerYear: 2080,
    defaultCurrency: "CAD",
    ratesToCad: { CAD: 1 },
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

  const renderPage = () =>
    renderWithQueryClient(
      <MemoryRouter>
        <FilteredJobsPage />
      </MemoryRouter>,
    );

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
});

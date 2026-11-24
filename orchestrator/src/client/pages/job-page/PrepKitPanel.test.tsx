import { createJob } from "@shared/testing/factories.js";
import type { PrepKitResponse } from "@shared/types.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { PrepKitPanel } from "./PrepKitPanel";

vi.mock("@/client/api", () => ({
  getPrepKit: vi.fn(),
  generatePrepKit: vi.fn(),
  savePrepKit: vi.fn(),
  addJot: vi.fn(),
  deleteJot: vi.fn(),
  proposePrepKitWrapUp: vi.fn(),
  applyPrepKitWrapUp: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const job = createJob({ id: "job-1", employer: "Jobber" });

const KIT: NonNullable<PrepKitResponse["kit"]> = {
  jobId: "job-1",
  sections: [
    {
      id: "s1",
      title: "Salary",
      cues: ["Ask for the upper end"],
      detail: "Band **$88K–$119K**",
    },
  ],
  questions: [
    {
      id: "q1",
      text: "Hybrid rhythm?",
      detail: "",
      answered: false,
      answer: "",
    },
  ],
  createdAt: "2026-11-24T18:00:00.000Z",
  updatedAt: "2026-11-24T18:00:00.000Z",
};

const withKit: PrepKitResponse = { kit: KIT, jots: [] };

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<PrepKitPanel job={job} />, { wrapper });
}

describe("PrepKitPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("offers to build a kit when there is none", async () => {
    vi.mocked(api.getPrepKit).mockResolvedValue({ kit: null, jots: [] });
    vi.mocked(api.generatePrepKit).mockResolvedValue(withKit);
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: /build prep kit/i }),
    );
    await waitFor(() =>
      expect(api.generatePrepKit).toHaveBeenCalledWith("job-1"),
    );
    expect(await screen.findByText("Ask for the upper end")).toBeVisible();
  });

  it("shows cues, expands detail, and ticks off questions", async () => {
    vi.mocked(api.getPrepKit).mockResolvedValue(withKit);
    vi.mocked(api.savePrepKit).mockImplementation(async (_id, content) => ({
      kit: { ...KIT, ...content },
      jots: [],
    }));
    renderPanel();

    expect(await screen.findByText("Ask for the upper end")).toBeVisible();
    expect(screen.queryByText(/88K/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByText(/88K/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /hybrid rhythm/i }));
    await waitFor(() =>
      expect(api.savePrepKit).toHaveBeenCalledWith("job-1", {
        sections: KIT.sections,
        questions: [expect.objectContaining({ id: "q1", answered: true })],
      }),
    );
  });

  it("saves a jot with the open card as a hint", async () => {
    vi.mocked(api.getPrepKit).mockResolvedValue(withKit);
    vi.mocked(api.addJot).mockResolvedValue({
      id: "j1",
      jobId: "job-1",
      text: "105 max",
      sectionHint: "Salary",
      createdAt: "2026-11-24T19:10:00.000Z",
      wrappedUpAt: null,
    });
    renderPanel();

    await screen.findByText("Ask for the upper end");
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    const input = screen.getByPlaceholderText(/jot a note/i);
    fireEvent.change(input, { target: { value: "105 max" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() =>
      expect(api.addJot).toHaveBeenCalledWith("job-1", {
        text: "105 max",
        sectionHint: "Salary",
      }),
    );
    expect(await screen.findByText("105 max")).toBeVisible();
    expect(screen.getByRole("button", { name: /wrap up/i })).toBeEnabled();
  });

  it("saves every jot when typing faster than the network", async () => {
    vi.mocked(api.getPrepKit).mockResolvedValue(withKit);
    const pending: Array<() => void> = [];
    vi.mocked(api.addJot).mockImplementation(
      (_id, input) =>
        new Promise((resolve) => {
          pending.push(() =>
            resolve({
              id: input.text,
              jobId: "job-1",
              text: input.text,
              sectionHint: null,
              createdAt: "2026-11-24T19:10:00.000Z",
              wrappedUpAt: null,
            }),
          );
        }),
    );
    renderPanel();

    await screen.findByText("Ask for the upper end");
    const input = screen.getByPlaceholderText(/jot a note/i);
    const form = input.closest("form") as HTMLFormElement;
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.submit(form);
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.submit(form);

    expect(api.addJot).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue("");
    for (const resolve of pending) resolve();
    expect(await screen.findByText("second")).toBeVisible();
    expect(screen.getByText("first")).toBeVisible();
  });

  it("wraps up into a reviewed note", async () => {
    vi.mocked(api.getPrepKit).mockResolvedValue({
      ...withKit,
      jots: [
        {
          id: "j1",
          jobId: "job-1",
          text: "1 day/wk KW",
          sectionHint: null,
          createdAt: "2026-11-24T19:10:00.000Z",
          wrappedUpAt: null,
        },
      ],
    });
    vi.mocked(api.proposePrepKitWrapUp).mockResolvedValue({
      noteTitle: "HR screen – 24 Nov",
      noteContent: "## Logistics\n- 1 day a week at K-W",
      kit: {
        sections: KIT.sections,
        questions: [
          { ...KIT.questions[0], answered: true, answer: "1 day/wk" },
        ],
      },
      changedSections: [],
      answeredQuestionIds: ["q1"],
      jotIds: ["j1"],
    });
    vi.mocked(api.applyPrepKitWrapUp).mockResolvedValue({
      ...withKit,
      jots: [],
      note: {
        id: "n1",
        jobId: "job-1",
        title: "HR screen – 24 Nov",
        content: "x",
        createdAt: "",
        updatedAt: "",
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /wrap up/i }));
    expect(await screen.findByDisplayValue("HR screen – 24 Nov")).toBeVisible();
    expect(screen.getByText(/Hybrid rhythm\? — 1 day\/wk/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /save to notes/i }));
    await waitFor(() =>
      expect(api.applyPrepKitWrapUp).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          noteTitle: "HR screen – 24 Nov",
          jotIds: ["j1"],
        }),
      ),
    );
  });
});

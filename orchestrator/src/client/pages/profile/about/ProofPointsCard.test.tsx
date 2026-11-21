import * as api from "@client/api";
import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import type { ProofPointEntry } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProofPointsCard } from "./ProofPointsCard";

vi.mock("@client/api", () => ({
  getProfileEntries: vi.fn(),
  getProfileInsights: vi.fn(),
  draftProofPoints: vi.fn(),
  createProofPoint: vi.fn(),
  updateProofPoint: vi.fn(),
  deleteProofPoint: vi.fn(),
}));

const draft: ProofPointEntry = {
  title: "Governance partner to Legal, Risk & Compliance",
  text: "Ran risk assessments and privacy impact assessments with legal.",
  role: null,
  skills: [
    { label: "Risk & compliance", keywords: ["risk assessment"] },
    { label: "Privacy", keywords: ["PIA"] },
  ],
  keywords: ["governance", "PIA"],
  metric: null,
  followUps: ["How many reviews a year?"],
  source: "ai",
};

const emptyEntries = {
  brand: null,
  pitch: null,
  values: null,
  skills: null,
  stories: [],
  proofPoints: [],
};

describe("ProofPointsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProfileEntries).mockResolvedValue(emptyEntries);
    vi.mocked(api.draftProofPoints).mockResolvedValue({
      drafts: [draft],
      roles: ["Product Manager at Acme"],
    });
    vi.mocked(api.createProofPoint).mockImplementation(async (data) => ({
      id: "p1",
      kind: "proof",
      data,
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    }));
  });

  it("turns typed text into an editable draft and saves the edited version", async () => {
    renderWithQueryClient(<ProofPointsCard />);

    fireEvent.change(screen.getByLabelText("Add a proof point"), {
      target: { value: "governance experience with legal and risk" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /turn into proof points/i }),
    );

    expect(await screen.findByDisplayValue(draft.title)).toBeInTheDocument();
    expect(api.draftProofPoints).toHaveBeenCalledWith(
      "governance experience with legal and risk",
    );
    expect(screen.getByText("How many reviews a year?")).toBeInTheDocument();

    // Drop a skill, add a number, then save.
    fireEvent.click(screen.getByRole("button", { name: "Remove Privacy" }));
    fireEvent.change(screen.getByLabelText("Number"), {
      target: { value: "40+ reviews a year" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(api.createProofPoint).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.createProofPoint).mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      title: draft.title,
      metric: "40+ reviews a year",
      keywords: ["governance", "PIA"],
      skills: [{ label: "Risk & compliance", keywords: ["risk assessment"] }],
    });
    await waitFor(() =>
      expect(screen.queryByDisplayValue(draft.title)).not.toBeInTheDocument(),
    );
  });

  it("lists saved proof points with their skills", async () => {
    vi.mocked(api.getProfileEntries).mockResolvedValue({
      ...emptyEntries,
      proofPoints: [
        {
          id: "p1",
          kind: "proof",
          data: { ...draft, metric: "40+ a year" },
          createdAt: "2026-11-21T00:00:00.000Z",
          updatedAt: "2026-11-21T00:00:00.000Z",
        },
      ],
    });
    renderWithQueryClient(<ProofPointsCard />);

    expect(await screen.findByText(draft.title)).toBeInTheDocument();
    expect(screen.getByText("40+ a year")).toBeInTheDocument();
    expect(screen.getByText(/1 saved/)).toBeInTheDocument();
  });
});

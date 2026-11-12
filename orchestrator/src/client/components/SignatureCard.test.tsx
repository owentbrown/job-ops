import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { SignatureCard } from "./SignatureCard";

vi.mock("../api", () => ({
  getSignatureStatus: vi.fn(),
  getSignatureBlob: vi.fn(),
  uploadSignature: vi.fn(),
  removeSignature: vi.fn(),
}));

const renderCard = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SignatureCard />
    </QueryClientProvider>,
  );

describe("SignatureCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:sig");
    URL.revokeObjectURL = vi.fn();
  });

  it("offers an upload when there is no signature", async () => {
    vi.mocked(api.getSignatureStatus).mockResolvedValue({ exists: false });
    renderCard();
    expect(
      await screen.findByRole("button", { name: /upload png/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByAltText("Your signature")).toBeNull();
  });

  it("shows the preview and Replace/Remove when a signature exists", async () => {
    vi.mocked(api.getSignatureStatus).mockResolvedValue({ exists: true });
    vi.mocked(api.getSignatureBlob).mockResolvedValue(
      new Blob(["x"], { type: "image/png" }),
    );
    renderCard();
    expect(await screen.findByAltText("Your signature")).toHaveAttribute(
      "src",
      "blob:sig",
    );
    expect(
      screen.getByRole("button", { name: /replace/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});

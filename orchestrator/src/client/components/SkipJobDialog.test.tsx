import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkipJobDialog } from "./SkipJobDialog";

describe("SkipJobDialog", () => {
  it("skips with the typed reason, trimmed", () => {
    const onConfirm = vi.fn();
    render(
      <SkipJobDialog
        open
        jobTitle="Product Ops"
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "  3 days in office  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip job" }));
    expect(onConfirm).toHaveBeenCalledWith({
      note: "3 days in office",
      category: null,
    });
  });

  it("allows skipping with no reason", () => {
    const onConfirm = vi.fn();
    render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip job" }));
    expect(onConfirm).toHaveBeenCalledWith({ note: "", category: null });
  });

  it("sends the picked reason chip with the note", () => {
    const onConfirm = vi.fn();
    render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salary" }));
    fireEvent.change(screen.getByLabelText(/note/i), {
      target: { value: "too low" },
    });
    fireEvent.click(screen.getByRole("button", { name: /skip job/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      note: "too low",
      category: "Salary",
    });
  });

  it("un-picks a chip when clicked again", () => {
    const onConfirm = vi.fn();
    render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    const chip = screen.getByRole("button", { name: "Company" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: /skip job/i }));
    expect(onConfirm).toHaveBeenCalledWith({ note: "", category: null });
  });

  it("leaves the page clickable when opened from a menu that blocked clicks", async () => {
    // A menu (separate Radix copy) has set body pointer-events to none.
    document.body.style.pointerEvents = "none";
    const { rerender } = render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={() => {}} />,
    );
    rerender(
      <SkipJobDialog
        open={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    await waitFor(() => expect(document.body.style.pointerEvents).toBe(""), {
      timeout: 2000,
    });
  });

  it("leaves the page clickable when removed while open", async () => {
    document.body.style.pointerEvents = "none";
    const { unmount } = render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={() => {}} />,
    );
    unmount();
    await waitFor(() => expect(document.body.style.pointerEvents).toBe(""), {
      timeout: 2000,
    });
  });
});

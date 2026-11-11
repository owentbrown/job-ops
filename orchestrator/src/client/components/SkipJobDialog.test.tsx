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
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "  3 days in office  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip job" }));
    expect(onConfirm).toHaveBeenCalledWith("3 days in office");
  });

  it("allows skipping with no reason", () => {
    const onConfirm = vi.fn();
    render(
      <SkipJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip job" }));
    expect(onConfirm).toHaveBeenCalledWith("");
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

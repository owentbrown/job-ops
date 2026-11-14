import { SKIP_CATEGORIES, type SkipCategoryChoice } from "@shared/types";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Radix menus and dialogs each block clicks on <body> while open and restore
 * the previous value when they close. This app has two copies of that Radix
 * layer code (menu and dialog), so a dialog opened from a menu can record the
 * menu's "none" and put it back on close, leaving the page unclickable. Once
 * nothing modal is open any more, clear it.
 */
export function releaseStuckPointerLock(): void {
  if (typeof document === "undefined") return;
  const stillOpen = document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
  if (!stillOpen && document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
  }
}

const RELEASE_DELAY_MS = 350;

export interface SkipJobConfirmInput {
  note: string;
  category: SkipCategoryChoice | null;
}

/** Asks for an optional reason chip and note before skipping. Both optional. */
export const SkipJobDialog: React.FC<{
  open: boolean;
  jobTitle?: string;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: SkipJobConfirmInput) => void;
}> = ({ open, jobTitle, isPending = false, onOpenChange, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<SkipCategoryChoice | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setCategory(null);
      return;
    }
    // Runs after the close animation.
    const timer = setTimeout(releaseStuckPointerLock, RELEASE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Also when the dialog is removed while open (e.g. the job moved away).
  useEffect(
    () => () => {
      setTimeout(releaseStuckPointerLock, RELEASE_DELAY_MS);
    },
    [],
  );

  const submit = () => {
    if (!isPending) onConfirm({ note: reason.trim(), category });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skip this job?</DialogTitle>
          <DialogDescription>
            {jobTitle ? `${jobTitle}. ` : ""}Pick a reason or add a note. Both
            are optional.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div
            role="group"
            aria-label="Reason"
            className="flex flex-wrap gap-2 pb-2"
          >
            {SKIP_CATEGORIES.map((choice) => {
              const selected = category === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategory(selected ? null : choice)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
          <Label htmlFor="skip-reason">Note (optional)</Label>
          <Textarea
            id="skip-reason"
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder="e.g. 3 days a week in the Toronto office"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Press ⌘/Ctrl + Enter to skip.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Skipping…" : "Skip job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

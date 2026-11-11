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

/** Asks for an optional reason before skipping. Empty is fine. */
export const SkipJobDialog: React.FC<{
  open: boolean;
  jobTitle?: string;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}> = ({ open, jobTitle, isPending = false, onOpenChange, onConfirm }) => {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
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
    if (!isPending) onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skip this job?</DialogTitle>
          <DialogDescription>
            {jobTitle ? `${jobTitle}. ` : ""}Adding a reason is optional. It's
            saved with the job.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label htmlFor="skip-reason">Reason (optional)</Label>
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

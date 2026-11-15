import type React from "react";
import { useCallback, useRef, useState } from "react";
import { type SkipJobConfirmInput, SkipJobDialog } from "./SkipJobDialog";

export interface SkipReasonPromptOptions {
  /** Shown under the heading, e.g. the job title or "3 selected jobs". */
  jobTitle?: string;
  /** Overrides "Skip this job?" (e.g. "Skip 3 jobs?"). */
  heading?: string;
  /** Overrides the "Skip job" button text. */
  confirmLabel?: string;
}

/**
 * Opens the skip-reason dialog and resolves with the picked reason, or null
 * if the user cancelled. Lets keyboard and bulk skips ask for a reason the
 * same way the Skip button does.
 */
export function useSkipReasonPrompt(): {
  askSkipReason: (
    options?: SkipReasonPromptOptions,
  ) => Promise<SkipJobConfirmInput | null>;
  isAsking: () => boolean;
  isOpen: boolean;
  skipReasonDialog: React.ReactElement;
} {
  const [request, setRequest] = useState<SkipReasonPromptOptions | null>(null);
  const resolverRef = useRef<
    ((value: SkipJobConfirmInput | null) => void) | null
  >(null);

  const settle = useCallback((value: SkipJobConfirmInput | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  const askSkipReason = useCallback((options: SkipReasonPromptOptions = {}) => {
    // A second ask while one is open cancels the first.
    resolverRef.current?.(null);
    return new Promise<SkipJobConfirmInput | null>((resolve) => {
      resolverRef.current = resolve;
      // Wait a tick so a closing menu or key event can't dismiss it at once.
      window.setTimeout(() => setRequest(options), 0);
    });
  }, []);

  const isAsking = useCallback(() => resolverRef.current !== null, []);

  const skipReasonDialog = (
    <SkipJobDialog
      open={request !== null}
      jobTitle={request?.jobTitle}
      heading={request?.heading}
      confirmLabel={request?.confirmLabel}
      onOpenChange={(open) => {
        if (!open) settle(null);
      }}
      onConfirm={(input) => settle(input)}
    />
  );

  return {
    askSkipReason,
    isAsking,
    isOpen: request !== null,
    skipReasonDialog,
  };
}

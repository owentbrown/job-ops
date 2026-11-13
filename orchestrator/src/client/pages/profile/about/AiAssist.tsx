import { ApiClientError } from "@client/api/core";
import { useProfileMutations } from "@client/hooks/useProfileInsights";
import {
  PROFILE_AI_NOTES_MAX,
  type ProfileAiDraftByTarget,
  type ProfileAiWriteRequest,
  type ProfileAiWriteTarget,
} from "@shared/types";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Friendly copy for the AI writing route's failures. */
export function aiWriteErrorMessage(error: unknown): string {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 502) {
    return "The AI couldn't write a draft just now. Nothing was changed; try again in a moment.";
  }
  if (status === 400) {
    return "Some of this text is too long for the AI. Shorten your notes or draft and try again.";
  }
  return "Couldn't reach the AI. Check your connection and try again.";
}

type RequestFor<T extends ProfileAiWriteTarget> = Extract<
  ProfileAiWriteRequest,
  { target: T }
>;

/**
 * "Write with AI" block for an About you panel: optional notes, a button, and
 * a busy / error state. The draft is handed to `onDraft` to fill the panel's
 * fields; nothing is saved until the user presses Save.
 */
export function AiAssist<T extends ProfileAiWriteTarget>({
  target,
  hasContent,
  current,
  onDraft,
  autoStart = false,
}: {
  target: T;
  /** Existing text in the panel: the button says "Rewrite" instead of "Write". */
  hasContent: boolean;
  /** The panel's unsaved values, sent so the AI can build on them. */
  current: () => RequestFor<T>["current"];
  onDraft: (draft: ProfileAiDraftByTarget[T]) => void;
  /** Generate once as soon as the panel opens. */
  autoStart?: boolean;
}): React.ReactElement {
  const id = useId();
  const { aiWrite } = useProfileMutations();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const busy = aiWrite.isPending;

  const run = async () => {
    setError(null);
    const trimmed = notes.trim();
    const request = {
      target,
      ...(trimmed ? { notes: trimmed } : {}),
      current: current(),
    } as RequestFor<T>;
    try {
      const draft = (await aiWrite.mutateAsync(
        request,
      )) as ProfileAiDraftByTarget[T];
      onDraft(draft);
      const asks = (draft as { followUps?: unknown }).followUps;
      setFollowUps(Array.isArray(asks) ? (asks as string[]) : []);
    } catch (err) {
      setError(aiWriteErrorMessage(err));
    }
  };

  // Run once on open when asked (e.g. the Pitch card's "Write with AI").
  const started = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void runRef.current();
  }, [autoStart]);

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="space-y-3 rounded-(--radius-card) border border-dashed bg-muted/40 p-3"
    >
      <h3
        id={`${id}-heading`}
        className="flex items-center gap-1.5 text-sm font-medium"
      >
        <Sparkles aria-hidden className="size-4 text-primary" />
        Write with AI
      </h3>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>Your thoughts (optional)</Label>
        <Textarea
          id={`${id}-notes`}
          value={notes}
          rows={3}
          maxLength={PROFILE_AI_NOTES_MAX}
          placeholder="What to stress, a result you're proud of, the tone you want…"
          aria-describedby={`${id}-hint`}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Uses only your resume, saved profile and these notes. Missing numbers
          come back as [placeholders] for you to fill in.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run()}
        >
          <Sparkles aria-hidden />
          {busy ? "Writing…" : hasContent ? "Rewrite with AI" : "Write with AI"}
        </Button>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {busy ? "Writing a draft. This can take a few seconds." : ""}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {followUps.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">To make it stronger, add:</p>
          <ul
            aria-label="Follow-up questions"
            className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground"
          >
            {followUps.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

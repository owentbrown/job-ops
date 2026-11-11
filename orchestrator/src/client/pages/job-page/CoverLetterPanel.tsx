import * as api from "@client/api";
import { DocumentActions } from "@client/components/DocumentActions";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import type { Job } from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Save, Sparkles, Upload } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SIGNATURE_KEY = ["cover-letter", "signature"] as const;

function fileSafe(value: string) {
  return (
    value.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "Job"
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Per-job cover letter: draft with AI (one call), edit, Save to approve,
 * then download the letter alone or letter + resume as one PDF.
 */
export const CoverLetterPanel: React.FC<{
  job: Job;
  /** Resume download name; the letter and combined files are named after it. */
  resumeFileName?: string;
}> = ({ job, resumeFileName }) => {
  const queryClient = useQueryClient();
  const saved = job.coverLetter ?? "";
  const [text, setText] = useState(saved);
  const [instructions, setInstructions] = useState("");
  const [isAiDraft, setIsAiDraft] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  // Follow the saved value when it changes elsewhere, unless mid-edit.
  const lastSavedRef = useRef(saved);
  useEffect(() => {
    if (lastSavedRef.current === saved) return;
    setText((current) => (current === lastSavedRef.current ? saved : current));
    lastSavedRef.current = saved;
  }, [saved]);

  const dirty = text.trim() !== saved.trim();
  const hasSaved = saved.trim().length > 0;

  const signature = useQuery({
    queryKey: SIGNATURE_KEY,
    queryFn: () => api.getSignatureStatus(),
    staleTime: 60_000,
  });

  // dataUpdatedAt reloads the preview after Replace (same exists=true).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch trigger
  useEffect(() => {
    if (!signature.data?.exists) {
      setSignatureUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    api
      .getSignatureBlob()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSignatureUrl(url);
      })
      .catch(() => setSignatureUrl(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [signature.data?.exists, signature.dataUpdatedAt]);

  const save = useMutation({
    mutationFn: () => api.saveCoverLetter(job.id, text.trim() || null),
    onSuccess: async (data) => {
      lastSavedRef.current = data.coverLetter ?? "";
      setIsAiDraft(false);
      toast.success(
        data.coverLetter ? "Cover letter saved" : "Cover letter cleared",
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
    onError: (error) =>
      showErrorToast(error, "Could not save the cover letter"),
  });

  const generate = useMutation({
    mutationFn: () => api.generateCoverLetterDraft(job.id, instructions.trim()),
    onSuccess: (data) => {
      setText(data.text);
      setIsAiDraft(true);
    },
    onError: (error) =>
      showErrorToast(error, "Could not draft the cover letter"),
  });

  const uploadSignature = useMutation({
    mutationFn: async (file: File) => {
      if (file.type && file.type !== "image/png") {
        throw new Error("Use a PNG image for the signature.");
      }
      return api.uploadSignature(await readFileAsBase64(file));
    },
    onSuccess: async () => {
      toast.success("Signature saved");
      await queryClient.invalidateQueries({ queryKey: SIGNATURE_KEY });
    },
    onError: (error) => showErrorToast(error, "Could not save the signature"),
  });

  const removeSignature = useMutation({
    mutationFn: () => api.removeSignature(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SIGNATURE_KEY });
    },
    onError: (error) => showErrorToast(error, "Could not remove the signature"),
  });

  const onDraft = () => {
    if (
      text.trim() &&
      !window.confirm("Replace the current text with a new AI draft?")
    ) {
      return;
    }
    generate.mutate();
  };

  const hasResume = Boolean(job.pdfPath);

  return (
    <section className="space-y-4 rounded-xl border border-border/50 bg-card/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-primary" />
            Cover letter
          </div>
          <p className="text-xs text-muted-foreground">
            Draft with AI (one AI call), edit, then Save to approve. PDFs use
            the saved version.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : hasSaved ? "Saved" : "No letter yet"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Optional notes for the AI, e.g. hiring manager is Jackie; mention the Toronto team"
          aria-label="Notes for the AI draft"
          maxLength={2000}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={generate.isPending || !job.jobDescription}
          onClick={onDraft}
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generate.isPending ? "Drafting…" : "Draft with AI"}
        </Button>
      </div>

      {isAiDraft && dirty ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          AI draft: check the facts and tone, edit anything, then Save.
        </p>
      ) : null}

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={16}
        aria-label="Cover letter text"
        placeholder={
          "Hi Jackie,\n\nOpening paragraph...\n\n- **Bold theme:** evidence...\n- **Bold theme:** evidence...\n\nClosing paragraph..."
        }
        className="font-mono text-xs leading-5"
      />
      <p className="text-xs text-muted-foreground">
        First line is the greeting. Blank lines separate paragraphs. Lines
        starting with "- " are bullets; **text** is bold. The date, your contact
        details, name and signature are added automatically.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {dirty && hasSaved ? (
          <Button size="sm" variant="ghost" onClick={() => setText(saved)}>
            Discard changes
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border/50 pt-4">
        <DocumentActions
          job={job}
          resumeFileName={
            resumeFileName ?? `${fileSafe(job.employer)}_${fileSafe(job.title)}`
          }
          disabledReason={dirty ? "Save your changes first" : null}
        />
        <p className="text-xs text-muted-foreground">
          {!hasSaved
            ? "Save a letter to view or download it."
            : dirty
              ? "Save your changes first: PDFs use the saved letter."
              : !hasResume
                ? "Combined needs the resume PDF too."
                : "Combined puts the letter first, then the resume, in one PDF."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
        <span className="text-xs text-muted-foreground">Signature:</span>
        {signatureUrl ? (
          <img
            src={signatureUrl}
            alt="Your signature"
            className="h-8 rounded bg-white px-1"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {signature.isLoading
              ? "Checking…"
              : "None (letter ends with your name)"}
          </span>
        )}
        <input
          ref={signatureInputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) uploadSignature.mutate(file);
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={uploadSignature.isPending}
          onClick={() => signatureInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {signature.data?.exists ? "Replace" : "Upload PNG"}
        </Button>
        {signature.data?.exists ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={removeSignature.isPending}
            onClick={() => removeSignature.mutate()}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </section>
  );
};

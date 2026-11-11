/**
 * View ▾ and Download ▾ menus for a job's application documents (fork):
 * the tailored resume, the cover letter, or both combined into one PDF
 * (letter first, then resume).
 */
import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { isPdfRegenerating, isPdfStale } from "@client/lib/pdf-freshness";
import type { Job } from "@shared/types.js";
import {
  ChevronDown,
  Download,
  Eye,
  Files,
  FileText,
  Loader2,
  Mail,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type DocumentKind = "resume" | "letter" | "combined";

type DocJob = Pick<
  Job,
  "id" | "pdfPath" | "coverLetter" | "pdfRegenerating" | "pdfFreshness"
>;

function openBlob(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) anchor.download = filename;
  else {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Why a document can't be opened right now, or null when it can. */
export function documentUnavailableReason(
  job: DocJob,
  kind: DocumentKind,
): string | null {
  const hasResume = Boolean(job.pdfPath);
  const hasLetter = Boolean(job.coverLetter?.trim());
  const regenerating = isPdfRegenerating(job);
  if (kind === "resume" || kind === "combined") {
    if (regenerating) return "Resume is being regenerated";
    if (!hasResume) return "No resume PDF yet";
  }
  if (kind === "letter" || kind === "combined") {
    if (!hasLetter) return "No cover letter yet";
  }
  return null;
}

/** File names that sort together: Name_Employer.pdf, …_Cover_Letter.pdf, … */
export function documentFileName(resumeFileName: string, kind: DocumentKind) {
  const resume = resumeFileName.replace(/\.pdf$/i, "");
  const base = resume.replace(/[-_ ]?resume$/i, "") || resume;
  if (kind === "letter") return `${base}_Cover_Letter.pdf`;
  if (kind === "combined") return `${base}_Application.pdf`;
  return `${resume}.pdf`;
}

async function loadDocument(jobId: string, kind: DocumentKind): Promise<Blob> {
  if (kind === "resume") return api.getJobPdfBlob(jobId);
  return api.getCoverLetterPdfBlob(jobId, kind === "combined");
}

const ITEMS: Array<{
  kind: DocumentKind;
  label: string;
  hint: string;
  icon: typeof FileText;
}> = [
  {
    kind: "resume",
    label: "Resume",
    hint: "Tailored resume",
    icon: FileText,
  },
  { kind: "letter", label: "Cover letter", hint: "Letter only", icon: Mail },
  {
    kind: "combined",
    label: "Combined",
    hint: "Letter + resume, one PDF",
    icon: Files,
  },
];

export const DocumentActions: React.FC<{
  job: DocJob;
  /** Resume download name, e.g. Owen_Brown_Acme.pdf */
  resumeFileName: string;
  size?: "sm" | "default";
  className?: string;
  /** Disables both menus, e.g. while the letter has unsaved edits. */
  disabledReason?: string | null;
}> = ({ job, resumeFileName, size = "sm", className, disabledReason }) => {
  const [busy, setBusy] = useState<
    null | `${"view" | "download"}-${DocumentKind}`
  >(null);
  const stale = isPdfStale(job);

  const run = async (action: "view" | "download", kind: DocumentKind) => {
    setBusy(`${action}-${kind}`);
    try {
      const blob = await loadDocument(job.id, kind);
      openBlob(
        blob,
        action === "download"
          ? documentFileName(resumeFileName, kind)
          : undefined,
      );
    } catch (error) {
      showErrorToast(
        error,
        action === "view"
          ? "Could not open the document"
          : "Could not download the document",
      );
    } finally {
      setBusy(null);
    }
  };

  const menu = (action: "view" | "download") => {
    const Icon = action === "view" ? Eye : Download;
    const isBusy = busy?.startsWith(action) ?? false;
    const anyAvailable = ITEMS.some(
      (item) => !documentUnavailableReason(job, item.kind),
    );
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={action === "download" ? "default" : "outline"}
            disabled={Boolean(disabledReason) || !anyAvailable || isBusy}
            title={disabledReason ?? undefined}
            className="gap-1.5"
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {action === "view" ? "View" : "Download"}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {action === "view" ? "Open in a new tab" : "Save a PDF"}
          </div>
          {ITEMS.map((item) => {
            const reason = documentUnavailableReason(job, item.kind);
            const ItemIcon = item.icon;
            return (
              <DropdownMenuItem
                key={item.kind}
                disabled={Boolean(reason)}
                onSelect={() => void run(action, item.kind)}
                className="items-start gap-2"
              >
                <ItemIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {item.label}
                    {stale && item.kind !== "letter" && !reason
                      ? " (older version)"
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {reason ?? item.hint}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {menu("view")}
      {menu("download")}
    </div>
  );
};

/**
 * The document strip at the top of Tailoring and Apply: what's ready, plus
 * the View / Download menus.
 */
export const ApplicationDocumentsBar: React.FC<{
  job: DocJob;
  resumeFileName: string;
  className?: string;
}> = ({ job, resumeFileName, className }) => {
  const hasResume = Boolean(job.pdfPath);
  const hasLetter = Boolean(job.coverLetter?.trim());
  const regenerating = isPdfRegenerating(job);
  const chip = (ready: boolean, label: string, pending?: string | null) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        ready
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ready ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {label}
      {pending ? ` · ${pending}` : ready ? "" : " · not yet"}
    </span>
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-semibold">Application documents</p>
        <div className="flex flex-wrap gap-1.5">
          {chip(
            hasResume && !regenerating,
            "Resume",
            regenerating
              ? "updating"
              : isPdfStale(job) && hasResume
                ? "older version"
                : null,
          )}
          {chip(hasLetter, "Cover letter")}
        </div>
      </div>
      <DocumentActions job={job} resumeFileName={resumeFileName} />
    </div>
  );
};

import type {
  DesignResumeDocument,
  PdfRenderer,
  TypstTheme,
} from "@shared/types";
import {
  PDF_RENDERER_LABELS,
  PDF_RENDERER_VALUES,
  TYPST_THEME_LABELS,
  TYPST_THEME_VALUES,
} from "@shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DesignResumePdfPreview } from "./DesignResumePdfPreview";

type DesignResumePreviewPanelProps = {
  draft: DesignResumeDocument;
  pdfRenderer: PdfRenderer;
  typstTheme: TypstTheme;
  isUpdatingRenderer: boolean;
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onPdfRendererChange: (renderer: PdfRenderer) => void;
  onTypstThemeChange: (theme: TypstTheme) => void;
  className?: string;
  /** Let the template selects share a narrow column on wide screens. */
  compact?: boolean;
};

export function DesignResumePreviewPanel({
  draft,
  pdfRenderer,
  typstTheme,
  isUpdatingRenderer,
  isDirty,
  saveState,
  onPdfRendererChange,
  onTypstThemeChange,
  className,
  compact = false,
}: DesignResumePreviewPanelProps) {
  const selectWidthClass = compact ? "xl:w-auto xl:min-w-0 xl:flex-1" : null;
  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-end gap-4 py-4",
          compact && "xl:flex-nowrap xl:gap-2 xl:pt-0 xl:pb-3",
        )}
      >
        <Select
          value={pdfRenderer}
          onValueChange={(value) => onPdfRendererChange(value as PdfRenderer)}
          disabled={isUpdatingRenderer}
        >
          <SelectTrigger
            id="design-resume-template"
            className={cn("w-full sm:w-72", selectWidthClass)}
          >
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {PDF_RENDERER_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {PDF_RENDERER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pdfRenderer === "typst" ? (
          <Select
            value={typstTheme}
            onValueChange={(value) => onTypstThemeChange(value as TypstTheme)}
            disabled={isUpdatingRenderer}
          >
            <SelectTrigger
              id="design-resume-typst-theme"
              className={cn("w-full sm:w-52", selectWidthClass)}
            >
              <SelectValue placeholder="Choose a Typst theme" />
            </SelectTrigger>
            <SelectContent>
              {TYPST_THEME_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TYPST_THEME_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DesignResumePdfPreview
          draft={draft}
          pdfRenderer={pdfRenderer}
          typstTheme={typstTheme}
          isUpdatingRenderer={isUpdatingRenderer}
          isDirty={isDirty}
          saveState={saveState}
        />
      </div>
    </section>
  );
}

import NumberFlow from "@number-flow/react";
import type { Job } from "@shared/types.js";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FitAssessmentContent } from "./FitAssessmentContent";
import { Tip } from "./Tip";

const getSuitabilityScoreTokens = (
  score: number | null,
  isAwaitingAi = false,
) => {
  if (score === null && isAwaitingAi) {
    return {
      shell: "border-info/55 bg-info/10 text-info",
      value: "loading",
      label: "Waiting for AI scoring to finish.",
    };
  }

  if (score === null) {
    return {
      shell: "border-destructive/40 bg-destructive/10 text-destructive",
      value: "!",
      label:
        "AI misconfiguration or service error. Please check your settings and AI service status.",
    };
  }

  if (score >= 70) {
    return {
      shell: "border-success/60 bg-success/10 text-success",
      value: `${Math.round(score)}`,
      label: `Suitability score ${Math.round(score)}`,
    };
  }

  if (score >= 60) {
    return {
      shell: "border-warning/60 bg-warning/10 text-warning",
      value: `${Math.round(score)}`,
      label: `Suitability score ${Math.round(score)}`,
    };
  }

  return {
    shell:
      "border-muted-foreground/55 bg-muted-foreground/10 text-muted-foreground",
    value: `${Math.round(score)}`,
    label: `Suitability score ${Math.round(score)}`,
  };
};

export function isAwaitingAiScore(
  job: Pick<Job, "status" | "suitabilityScore">,
): boolean {
  if (job.suitabilityScore != null) return false;
  return job.status === "discovered" || job.status === "processing";
}

export const ScoreRing: React.FC<{
  score: number | null;
  size?: "sm" | "lg";
  isAwaitingAi?: boolean;
  suitabilityReason?: string | null;
  jobId?: string;
}> = ({
  score,
  size = "lg",
  isAwaitingAi = false,
  suitabilityReason,
  jobId,
}) => {
  const tokens = getSuitabilityScoreTokens(score, isAwaitingAi);
  const isLoading = score === null && isAwaitingAi;
  const hasReason = !!suitabilityReason;

  const [popoverOpen, setPopoverOpen] = useState(false);

  const handlePopoverOpenChange = (open: boolean) => {
    setPopoverOpen(open);
  };

  if (!hasReason) {
    return (
      <Tip
        content={tokens.label}
        contentClassName="max-w-60 text-xs"
        side="left"
      >
        <div
          role="img"
          aria-label={tokens.label}
          className={cn(
            "relative overflow-visible",
            size === "sm"
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 p-1"
              : "flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 p-1",
            tokens.shell,
          )}
        >
          <motion.span
            key={`${jobId}-${score}`}
            className={cn(
              "absolute inset-0 rounded-full border-2 pointer-events-none",
              tokens.shell,
            )}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          <div className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-full border border-foreground/5 bg-background/70 text-center shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)]">
            <div
              className={cn(
                size === "sm" ? "text-lg" : "text-2xl",
                "font-semibold leading-none tabular-nums",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : score === null ? (
                tokens.value
              ) : (
                <NumberFlow value={Math.round(score)} isolate />
              )}
            </div>
            {size === "lg" && (
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-current/70">
                score
              </div>
            )}
          </div>
        </div>
      </Tip>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
      <Tip
        asChild
        content="Find out why"
        contentClassName="text-xs"
        clickBehavior="none"
        disabled={popoverOpen}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="View fit assessment"
            className={cn(
              "relative overflow-visible",
              size === "sm"
                ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 p-1"
                : "flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 p-1",
              tokens.shell,
              "transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              score !== null &&
                (score >= 70
                  ? "hover:shadow-[0_0_15px_color-mix(in_oklch,var(--color-success)_45%,transparent)] hover:border-success/80"
                  : score >= 60
                    ? "hover:shadow-[0_0_15px_color-mix(in_oklch,var(--color-warning)_45%,transparent)] hover:border-warning/80"
                    : "hover:shadow-[0_0_15px_color-mix(in_oklch,var(--color-muted-foreground)_45%,transparent)] hover:border-muted-foreground/80"),
            )}
          >
            <motion.span
              key={`${jobId}-${score}`}
              className={cn(
                "absolute inset-0 rounded-full border-2 pointer-events-none",
                tokens.shell,
              )}
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-full border border-foreground/5 bg-background/70 text-center shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)]">
              <div
                className={cn(
                  size === "sm" ? "text-lg" : "text-2xl",
                  "font-semibold leading-none tabular-nums",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : score === null ? (
                  tokens.value
                ) : (
                  <NumberFlow value={Math.round(score)} isolate />
                )}
              </div>
              {size === "lg" && (
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-current/70">
                  score
                </div>
              )}
            </div>
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-96 rounded-xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md z-[100]"
      >
        <FitAssessmentContent
          score={score}
          suitabilityReason={suitabilityReason}
        />
      </PopoverContent>
    </Popover>
  );
};

import type React from "react";
import { cn } from "@/lib/utils";

const RADIUS = 15.9155; // circumference of 100 in a 36×36 viewBox

/**
 * Circular score. `tone="banner"` sits on the sidebar colours (brand banner);
 * `tone="card"` sits on a card surface. Colours are tokens only.
 */
export const ScoreRing: React.FC<{
  value: number;
  max?: number;
  label: string;
  size?: "sm" | "lg";
  tone?: "banner" | "card";
  /** Text in the middle; defaults to the value. */
  center?: React.ReactNode;
}> = ({ value, max = 100, label, size = "lg", tone = "card", center }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("relative shrink-0", size === "lg" ? "size-20" : "size-12")}
    >
      <svg
        viewBox="0 0 36 36"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="3.2"
          className={
            tone === "banner" ? "stroke-(--sidebar-accent)" : "stroke-muted"
          }
        />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={`${pct} ${100 - pct}`}
          className={
            tone === "banner" ? "stroke-(--sidebar-ring)" : "stroke-primary"
          }
        />
      </svg>
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums",
          size === "lg" ? "text-xl" : "text-sm",
          tone === "banner" ? "text-sidebar-foreground" : "text-foreground",
        )}
      >
        {center ?? Math.round(value)}
      </span>
    </div>
  );
};

/** Profile strength ring for the brand banner. */
export const StrengthRing: React.FC<{ total: number; max?: number }> = ({
  total,
  max = 100,
}) => (
  <ScoreRing
    value={total}
    max={max}
    tone="banner"
    label={`Profile strength ${Math.round(total)} out of ${max}`}
    center={`${Math.round(total)}%`}
  />
);

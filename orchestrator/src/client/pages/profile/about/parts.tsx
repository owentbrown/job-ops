import type { ProfileActionId, Theme } from "@shared/types";
import type React from "react";
import { cn } from "@/lib/utils";

/**
 * Which edit surface a button asks for. The page decides what to open:
 * `edit-resume` goes to Document Studio, the rest open side panels.
 */
export type AboutPanel =
  | { kind: ProfileActionId | "edit-skills" }
  | { kind: "edit-story"; storyId: string }
  /** Opens the pitch panel and starts an AI draft right away. */
  | { kind: "edit-pitch"; autoWrite: true };

export type OnEdit = (panel: AboutPanel) => void;

/** Small uppercase-or-not label that follows the theme's label style. */
export const labelClass =
  "text-xs font-semibold [letter-spacing:var(--label-tracking)] [text-transform:var(--label-transform)]";

export const THEME_LABELS: Record<Theme, string> = {
  delivery: "Delivery",
  analytics: "Analytics",
  customer: "Customer",
  leadership: "Leadership",
  influence: "Influence",
  failure: "Failure",
};

export const TOO_EARLY_COPY =
  "Too early. These fill in after your first searches.";

/** Card heading row: title, optional subtitle, optional actions on the right. */
export const CardHeading: React.FC<{
  id: string;
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ id, title, subtitle, children }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0 space-y-1">
      <h2
        id={id}
        className="font-heading text-lg font-(weight:--heading-weight) leading-tight tracking-(--heading-tracking)"
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
    {children ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {children}
      </div>
    ) : null}
  </div>
);

/** Outlined chip on a card surface. */
export const Chip: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <li
    className={cn(
      "inline-flex items-center gap-1 rounded-(--radius-pill) border px-3 py-1 text-sm text-foreground",
      className,
    )}
  >
    {children}
  </li>
);

/** Dashed empty-state box with a line of copy and an optional action. */
export const EmptyState: React.FC<{
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ children, action }) => (
  <div className="flex flex-col items-start gap-3 rounded-(--radius) border border-dashed p-4 text-sm text-muted-foreground">
    <p>{children}</p>
    {action}
  </div>
);

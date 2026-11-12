import type { OverviewResponse } from "@shared/types.js";
import { AlertTriangle } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { overviewLabelClass } from "./label";

type Tile = {
  label: string;
  count: number;
  noun: string;
  to: string;
};

/**
 * One action tile. The per-theme structure (outlined cards, joined grid,
 * tinted fills) lives in styles/appearance-structure.css under
 * `.overview-tiles` / `.overview-tile`; `tint` picks Soft's fill (1-3).
 */
const TileShell: React.FC<{
  tone?: "warning";
  tint?: 1 | 2 | 3;
  children: React.ReactNode;
}> = ({ tone, tint, children }) => (
  <div data-tile="" data-tone={tone} data-tint={tint} className="overview-tile">
    {children}
  </div>
);

const labelClass = cn(overviewLabelClass, "text-(--tile-label-fg)");

export const ActionTiles: React.FC<{
  actions: OverviewResponse["actions"];
  challenge: { extractorName: string } | null;
}> = ({ actions, challenge }) => {
  const tiles: Tile[] = [
    {
      label: "Review",
      count: actions.readyCount,
      noun: "jobs to review",
      to: "/jobs/ready",
    },
    {
      label: "Discover",
      count: actions.discoveredCount,
      noun: "new jobs discovered",
      to: "/jobs/discovered",
    },
    {
      label: "Inbox",
      count: actions.inboxPendingCount,
      noun: "emails to match or confirm",
      to: "/applications/inbox",
    },
  ];

  return (
    <div data-action-tiles="" className="overview-tiles">
      {challenge ? (
        <TileShell tone="warning">
          <p className={cn("flex items-center gap-2", labelClass)}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Blocking your search
          </p>
          <p className="font-heading text-[length:calc(var(--heading-size)-2px)] font-(weight:--heading-weight) leading-tight tracking-tight">
            Solve browser check
            <span className="mt-1 block font-sans text-base font-normal tracking-normal text-(--warning-fg)">
              {challenge.extractorName}
            </span>
          </p>
          <Link
            to="/jobs/ready"
            aria-label={`Solve browser check for ${challenge.extractorName}`}
            className="self-start rounded-(--radius-button) bg-(--warning-fg) px-4 py-2 text-sm font-medium text-(--warning-bg)"
          >
            Solve
          </Link>
        </TileShell>
      ) : null}

      {tiles.map((t, i) => (
        <TileShell key={t.to} tint={(i + 1) as 1 | 2 | 3}>
          <p className={labelClass}>{t.label}</p>
          <p
            data-tile-number=""
            className={cn(
              "font-mono text-(length:--tile-number-size) font-(weight:--tile-number-weight) leading-none tabular-nums",
              t.count === 0 && "text-muted-foreground",
            )}
          >
            {t.count}
          </p>
          <Link
            to={t.to}
            aria-label={`${t.count} ${t.noun}`}
            className="self-start text-sm font-medium text-(--tile-link-fg) underline-offset-4 hover:underline"
          >
            {t.noun} →
          </Link>
        </TileShell>
      ))}
    </div>
  );
};

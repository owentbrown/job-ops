import type { OverviewResponse } from "@shared/types.js";
import { AlertTriangle } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tile = {
  label: string;
  count: number;
  noun: string;
  to: string;
};

const TileShell: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div
    className={cn(
      "flex min-h-[210px] min-w-[260px] flex-1 basis-[280px] flex-col justify-between rounded-[18px] border border-border/60 bg-card p-6",
      className,
    )}
  >
    {children}
  </div>
);

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
    <div className="flex flex-wrap gap-4">
      {challenge ? (
        <TileShell className="border-warning/50 bg-warning/10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Blocking your search
          </p>
          <p className="font-heading text-2xl font-semibold leading-tight tracking-tight">
            Solve browser check
            <span className="mt-1 block text-base text-muted-foreground">
              {challenge.extractorName}
            </span>
          </p>
          <Link
            to="/jobs/ready"
            aria-label={`Solve browser check for ${challenge.extractorName}`}
            className="self-start rounded-[10px] bg-warning px-4 py-2 text-sm font-medium text-warning-foreground"
          >
            Solve
          </Link>
        </TileShell>
      ) : null}

      {tiles.map((t) => (
        <TileShell key={t.to}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.label}
          </p>
          <p
            className={cn(
              "font-mono text-6xl leading-none tabular-nums",
              t.count === 0 && "text-muted-foreground",
            )}
          >
            {t.count}
          </p>
          <Link
            to={t.to}
            aria-label={`${t.count} ${t.noun}`}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.noun} →
          </Link>
        </TileShell>
      ))}
    </div>
  );
};

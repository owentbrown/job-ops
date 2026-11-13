import type { ProfileLandingInsight } from "@shared/types";
import { TriangleAlert } from "lucide-react";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CardHeading, EmptyState, labelClass } from "./parts";

/** Show the focus warning once this share of applications is low-fit. */
export const LOW_FIT_WARN_PCT = 25;

const Tile: React.FC<{
  label: string;
  stat: React.ReactNode;
  children: React.ReactNode;
  tint: 1 | 2 | 3;
}> = ({ label, stat, children, tint }) => (
  <li
    className={cn(
      "flex flex-col gap-1 rounded-(--radius-tile) p-4 text-foreground",
      tint === 1 && "bg-(--tile-tint-1)",
      tint === 2 && "bg-(--tile-tint-2)",
      tint === 3 && "bg-(--tile-tint-3)",
    )}
  >
    <span className={labelClass}>{label}</span>
    <span className="font-mono text-2xl font-semibold tabular-nums">
      {stat}
    </span>
    <span className="text-sm">{children}</span>
  </li>
);

export const LandingCard: React.FC<{ landing: ProfileLandingInsight }> = ({
  landing,
}) => {
  const { applications, averageFit, best, lowFitSharePct, lowFitFamilies } =
    landing;
  const warn = lowFitSharePct !== null && lowFitSharePct >= LOW_FIT_WARN_PCT;
  return (
    <Card aria-labelledby="about-landing">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading id="about-landing" title="How you're landing" />
        {applications === 0 ? (
          <EmptyState>
            No applications yet. Once you apply, this shows your average fit and
            where your applications are going.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            <Tile label="Applications sent" stat={applications} tint={1}>
              {averageFit !== null
                ? `Average fit ${Math.round(averageFit)}`
                : "Not scored yet"}
            </Tile>
            <Tile
              label="Best fit so far"
              stat={best ? Math.round(best.score) : "—"}
              tint={2}
            >
              {best
                ? `${best.title} at ${best.employer}`
                : "No scored applications"}
            </Tile>
            <Tile
              label="Focus"
              stat={
                lowFitSharePct !== null ? `${Math.round(lowFitSharePct)}%` : "—"
              }
              tint={3}
            >
              {warn ? (
                <span className="inline-flex items-start gap-1">
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <span>
                    of applications are in low-fit roles
                    {lowFitFamilies.length
                      ? ` (${lowFitFamilies.join(", ")})`
                      : ""}
                    . Aim them at roles that fit.
                  </span>
                </span>
              ) : (
                "of applications are in low-fit roles. Good focus."
              )}
            </Tile>
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

import type { OverviewScoreBandRow } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { canShowRate, percent, rateLabel } from "./format";

function takeaway(rows: OverviewScoreBandRow[]): string {
  const readable = rows
    .filter((r) => canShowRate(r.applied))
    .map((r) => ({ band: r.band, rate: percent(r.replied, r.applied) }));
  if (readable.length < 2) return "No clear pattern yet.";
  const top = readable.reduce((a, b) => (b.rate > a.rate ? b : a));
  const lowest = readable.reduce((a, b) => (b.rate < a.rate ? b : a));
  const ninetyPlus = readable.find((r) => r.band === "90+");
  if (
    (top.band === "90+" || top.band === "80-89") &&
    top.rate - lowest.rate >= 10 &&
    (!ninetyPlus || ninetyPlus.rate >= lowest.rate + 10)
  ) {
    return "Higher scores are getting more replies.";
  }
  const lowestScoreBand = readable[0];
  if (top.band === lowestScoreBand.band && top.rate > lowest.rate) {
    return "Scores aren't predicting replies yet.";
  }
  return "No clear pattern yet.";
}

export const ScoreBandsCard: React.FC<{ rows: OverviewScoreBandRow[] }> = ({
  rows,
}) => {
  const totalReplied = rows.reduce((sum, r) => sum + r.replied, 0);
  const anyReadable = rows.some((r) => canShowRate(r.applied));
  const showHint = !anyReadable || totalReplied === 0;

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="space-y-4 p-6">
        <h3 className="text-sm font-semibold">Reply rate by score</h3>
        {showHint ? (
          <p className="text-sm text-muted-foreground">
            Fills in after your first reply and a few applications in each band.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.band} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{r.band}</span>
                    <span className="font-mono tabular-nums">
                      {rateLabel(r.replied, r.applied)}
                    </span>
                  </div>
                  {canShowRate(r.applied) ? (
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${percent(r.replied, r.applied)}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{takeaway(rows)}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

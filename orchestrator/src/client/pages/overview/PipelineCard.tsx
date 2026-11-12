import {
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
} from "@shared/pipeline-buckets";
import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { percent } from "./format";

export const PipelineCard: React.FC<{
  pipeline: OverviewResponse["pipeline"];
}> = ({ pipeline }) => {
  const { total, buckets, withdrawn } = pipeline;
  const ariaLabel = `Pipeline: ${PIPELINE_BUCKETS.map(
    (b) => `${PIPELINE_BUCKET_LABELS[b]} ${buckets[b]}`,
  ).join(", ")}`;

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="space-y-5 p-6">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-4xl tabular-nums">{total}</span>
          <span className="text-sm text-muted-foreground">
            {total === 1 ? "application" : "applications"}
          </span>
        </p>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No applications yet. Mark a job as applied and it shows up here.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label={ariaLabel}
              className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            >
              {PIPELINE_BUCKETS.filter((b) => buckets[b] > 0).map((b) => (
                <div
                  key={b}
                  data-segment={b}
                  className="h-full min-w-[10px]"
                  style={{
                    flexGrow: buckets[b],
                    backgroundColor: `var(--bucket-${b})`,
                  }}
                />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {PIPELINE_BUCKETS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--bucket-${b})` }}
                  />
                  <span>{PIPELINE_BUCKET_LABELS[b]}</span>
                  <span className="ml-auto font-mono tabular-nums">
                    {buckets[b]}
                  </span>
                  <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {percent(buckets[b], total)}%
                  </span>
                </li>
              ))}
            </ul>
            {withdrawn > 0 ? (
              <p className="text-xs text-muted-foreground">
                +{withdrawn} withdrawn
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

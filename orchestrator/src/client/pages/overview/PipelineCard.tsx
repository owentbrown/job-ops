import type { PipelineBucket } from "@shared/pipeline-buckets";
import {
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
} from "@shared/pipeline-buckets";
import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { percent } from "./format";

export const PipelineCard: React.FC<{
  pipeline: OverviewResponse["pipeline"];
}> = ({ pipeline }) => {
  const { total, buckets, withdrawn } = pipeline;
  // The bucket under the pointer (bar or legend); the others dim.
  const [active, setActive] = useState<PipelineBucket | null>(null);
  const dim = (b: PipelineBucket) => active !== null && active !== b;
  const hoverProps = (b: PipelineBucket) => ({
    onMouseEnter: () => setActive(b),
    onMouseLeave: () => setActive(null),
  });
  const ariaLabel = `Pipeline: ${PIPELINE_BUCKETS.map(
    (b) => `${PIPELINE_BUCKET_LABELS[b]} ${buckets[b]}`,
  ).join(", ")}`;

  return (
    <Card>
      <CardContent className="space-y-5 pt-(--density-pad)">
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
              data-pipeline-bar=""
              className="flex h-(--bar-height) w-full gap-(--bar-gap)"
              onMouseLeave={() => setActive(null)}
            >
              {PIPELINE_BUCKETS.filter((b) => buckets[b] > 0).map((b) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: hover only adds visual emphasis; the bar's aria-label and the legend carry the same data
                <div
                  key={b}
                  data-segment={b}
                  data-dimmed={dim(b) || undefined}
                  title={`${PIPELINE_BUCKET_LABELS[b]}: ${buckets[b]}`}
                  className={cn(
                    "h-full min-w-[10px] rounded-(--bar-radius) transition-opacity duration-150",
                    dim(b) && "opacity-25",
                  )}
                  onMouseEnter={() => setActive(b)}
                  style={{
                    flexGrow: buckets[b],
                    backgroundColor: `var(--bucket-${b})`,
                  }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {PIPELINE_BUCKETS.map((b) => (
                <li
                  key={b}
                  data-legend={b}
                  data-dimmed={dim(b) || undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md text-sm transition-opacity duration-150",
                    dim(b) && "opacity-40",
                    active === b && "font-medium",
                  )}
                  {...hoverProps(b)}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 self-center rounded-(--radius-pill)"
                    style={{ backgroundColor: `var(--bucket-${b})` }}
                  />
                  <span>{PIPELINE_BUCKET_LABELS[b]}</span>
                  <span className="ml-1 font-mono tabular-nums">
                    {buckets[b]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    ({percent(buckets[b], total)}%)
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

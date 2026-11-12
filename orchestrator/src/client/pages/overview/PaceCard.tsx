import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Bar, BarChart, XAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { formatDays, formatShortDate } from "./format";
import { overviewLabelClass } from "./label";

const config = {
  count: { label: "Applications", color: "var(--primary)" },
};

function chartLabel(pace: OverviewResponse["pace"]): string {
  const total = pace.perDay.reduce((sum, d) => sum + d.count, 0);
  const days = pace.perDay.length;
  const best = pace.bestDay
    ? `, best day ${pace.bestDay.count} on ${formatShortDate(pace.bestDay.date)}`
    : "";
  return `Applications per day: ${total} in the last ${days} days${best}`;
}

export const PaceCard: React.FC<{ pace: OverviewResponse["pace"] }> = ({
  pace,
}) => (
  <Card>
    <CardContent className="space-y-4 pt-(--density-pad)">
      <h3 className="text-[15px] font-semibold">Pace</h3>
      <div role="img" aria-label={chartLabel(pace)}>
        <ChartContainer config={config} className="h-40 w-full">
          <BarChart data={pace.perDay}>
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <Bar dataKey="count" fill="var(--color-count)" radius={3} />
          </BarChart>
        </ChartContainer>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className={cn(overviewLabelClass, "text-muted-foreground")}>
            Average per day
          </dt>
          <dd className="font-mono text-xl tabular-nums">
            {pace.avgPerDay.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt className={cn(overviewLabelClass, "text-muted-foreground")}>
            Best day
          </dt>
          <dd className="font-mono text-xl tabular-nums">
            {pace.bestDay
              ? `${pace.bestDay.count} on ${formatShortDate(pace.bestDay.date)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className={cn(overviewLabelClass, "text-muted-foreground")}>
            Found → applied
          </dt>
          <dd className="font-mono text-xl tabular-nums">
            {formatDays(pace.medianFoundToAppliedDays)}
          </dd>
        </div>
      </dl>
    </CardContent>
  </Card>
);

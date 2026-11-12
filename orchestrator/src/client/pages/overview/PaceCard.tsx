import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Bar, BarChart, XAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { formatDays, formatShortDate } from "./format";

const config = {
  count: { label: "Applications", color: "var(--primary)" },
};

export const PaceCard: React.FC<{ pace: OverviewResponse["pace"] }> = ({
  pace,
}) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-4 p-6">
      <h3 className="text-sm font-semibold">Pace</h3>
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
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Average per day</dt>
          <dd className="font-mono text-xl tabular-nums">
            {pace.avgPerDay.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Best day</dt>
          <dd className="font-mono text-xl tabular-nums">
            {pace.bestDay
              ? `${pace.bestDay.count} on ${formatShortDate(pace.bestDay.date)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Found → applied</dt>
          <dd className="font-mono text-xl tabular-nums">
            {formatDays(pace.medianFoundToAppliedDays)}
          </dd>
        </div>
      </dl>
    </CardContent>
  </Card>
);

/**
 * Spend page (fork: spend): estimated AI cost from recorded token usage,
 * by period, day, task, pipeline run, job and model.
 */
import * as api from "@client/api";
import { SectionCard } from "@client/components/layout";
import { PageFrame } from "@client/components/PageFrame";
import type { SpendJobRow, SpendReport } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Loader2, Tags, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  featureLabel,
  formatTokens,
  formatUsd,
  JOB_FILTER_LABELS,
  type JobSpendFilter,
  matchesJobFilter,
  PERIOD_LABELS,
  periodStart,
  type SpendPeriod,
  STATUS_LABELS,
} from "./spend/format";
import { PricingDialog } from "./spend/PricingDialog";

const chartConfig = {
  cost: { label: "Spend", color: "var(--chart-1)" },
};

const browserTimeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

function formatDay(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Stat(props: { label: string; value: string; hint?: string }) {
  return (
    <SectionCard className="space-y-1">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className="text-2xl font-semibold tabular-nums">{props.value}</p>
      {props.hint ? (
        <p className="text-xs text-muted-foreground">{props.hint}</p>
      ) : null}
    </SectionCard>
  );
}

function sumCost(rows: SpendJobRow[]): number {
  return rows.reduce((total, row) => total + row.cost, 0);
}

export function SpendPage() {
  const [period, setPeriod] = useState<SpendPeriod>("30d");
  const [jobFilter, setJobFilter] = useState<JobSpendFilter>("all");
  const [jobSort, setJobSort] = useState<"cost" | "score" | "recent">("cost");
  const [pricingOpen, setPricingOpen] = useState(false);

  const from = useMemo(() => periodStart(period), [period]);
  const reportKey = { from, to: null, timeZone: browserTimeZone };
  const { data, isLoading, error } = useQuery<SpendReport>({
    queryKey: queryKeys.spend.report(reportKey),
    queryFn: () => api.getSpendReport(reportKey),
  });

  const appliedRows = useMemo(
    () =>
      (data?.jobs ?? []).filter((row) =>
        matchesJobFilter(row.status, "applied"),
      ),
    [data],
  );

  const jobRows = useMemo(() => {
    const rows = (data?.jobs ?? []).filter((row) =>
      matchesJobFilter(row.status, jobFilter),
    );
    if (jobSort === "score") {
      return [...rows].sort(
        (a, b) => (b.suitabilityScore ?? -1) - (a.suitabilityScore ?? -1),
      );
    }
    if (jobSort === "recent") {
      return [...rows].sort((a, b) =>
        (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""),
      );
    }
    return rows;
  }, [data, jobFilter, jobSort]);

  const totals = data?.totals;
  const scoring = data?.byFeature.find((f) => f.feature === "scoring");
  const scoredJobs = (data?.jobs ?? []).filter(
    (row) => (row.byFeature.scoring ?? 0) > 0,
  ).length;

  return (
    <>
      <PageFrame
        icon={CircleDollarSign}
        title="Spend"
        subtitle="Estimated AI cost, from the tokens each call used"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPricingOpen(true)}
          >
            <Tags className="mr-1.5 h-4 w-4" />
            Prices
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={period}
            onValueChange={(value) => setPeriod(value as SpendPeriod)}
          >
            <TabsList className="flex-wrap">
              {(Object.keys(PERIOD_LABELS) as SpendPeriod[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {PERIOD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {data?.trackingSince ? (
            <p className="text-xs text-muted-foreground">
              Tracking since {formatDateTime(data.trackingSince)}. Earlier runs
              weren&apos;t recorded.
            </p>
          ) : null}
        </div>

        {error ? (
          <SectionCard>
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load spend"}
            </p>
          </SectionCard>
        ) : null}

        {data && data.unpricedModels.length > 0 ? (
          <SectionCard className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              No price set for {data.unpricedModels.join(", ")}, so those calls
              count as $0.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setPricingOpen(true)}
              >
                Add a price
              </button>
            </div>
          </SectionCard>
        ) : null}

        {isLoading || !data || !totals ? (
          <SectionCard className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading spend...
          </SectionCard>
        ) : totals.calls === 0 ? (
          <SectionCard className="py-10 text-center text-sm text-muted-foreground">
            No AI calls recorded {period === "all" ? "yet" : "in this period"}.
            Spend shows up here after the next search, scoring or tailoring run.
          </SectionCard>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label={`Spend · ${PERIOD_LABELS[period]}`}
                value={formatUsd(totals.cost)}
                hint={`${totals.calls.toLocaleString()} AI calls`}
              />
              <Stat
                label="Per scored job"
                value={
                  scoring && scoredJobs > 0
                    ? formatUsd(scoring.cost / scoredJobs)
                    : "-"
                }
                hint={`${scoredJobs.toLocaleString()} jobs scored`}
              />
              <Stat
                label="On jobs you applied to"
                value={formatUsd(sumCost(appliedRows))}
                hint={`${appliedRows.length} applied ${appliedRows.length === 1 ? "job" : "jobs"}`}
              />
              <Stat
                label="Tokens"
                value={formatTokens(
                  totals.inputTokens +
                    totals.cacheReadTokens +
                    totals.cacheWriteTokens,
                )}
                hint={`in · ${formatTokens(totals.outputTokens)} out`}
              />
            </div>

            <SectionCard className="space-y-3">
              <h2 className="text-sm font-semibold">Spend by day</h2>
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart
                  data={data.byDay}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={(value) => formatDay(String(value))}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(value) => formatUsd(Number(value))}
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--color-cost)", opacity: 0.18 }}
                    content={
                      <ChartTooltipContent
                        nameKey="cost"
                        labelFormatter={(value) => formatDay(String(value))}
                        formatter={(value) => formatUsd(Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey="cost"
                    fill="var(--color-cost)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </SectionCard>

            <SectionCard>
              <Tabs defaultValue="tasks" className="space-y-3">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="tasks">By task</TabsTrigger>
                  <TabsTrigger value="runs">By run</TabsTrigger>
                  <TabsTrigger value="jobs">By job</TabsTrigger>
                  <TabsTrigger value="models">By model</TabsTrigger>
                </TabsList>

                <TabsContent value="tasks">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Share</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byFeature.map((row) => (
                          <TableRow key={row.feature}>
                            <TableCell>{featureLabel(row.feature)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.calls.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatTokens(
                                row.inputTokens +
                                  row.cacheReadTokens +
                                  row.cacheWriteTokens +
                                  row.outputTokens,
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {totals.cost > 0
                                ? `${Math.round((row.cost / totals.cost) * 100)}%`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatUsd(row.cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="runs">
                  {data.runs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No pipeline runs in this period.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Started</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Found</TableHead>
                            <TableHead className="text-right">
                              Jobs with AI work
                            </TableHead>
                            <TableHead className="text-right">
                              Per job found
                            </TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.runs.map((run) => (
                            <TableRow key={run.runId}>
                              <TableCell className="whitespace-nowrap">
                                {formatDateTime(run.startedAt)}
                              </TableCell>
                              <TableCell className="capitalize">
                                {run.status ?? "Deleted"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {run.jobsDiscovered?.toLocaleString() ?? "-"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {run.jobsTouched.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {run.jobsDiscovered
                                  ? formatUsd(run.cost / run.jobsDiscovered)
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatUsd(run.cost)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="jobs" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={jobFilter}
                      onValueChange={(value) =>
                        setJobFilter(value as JobSpendFilter)
                      }
                    >
                      <SelectTrigger
                        className="w-[180px]"
                        aria-label="Job filter"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(JOB_FILTER_LABELS) as JobSpendFilter[]
                        ).map((key) => (
                          <SelectItem key={key} value={key}>
                            {JOB_FILTER_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={jobSort}
                      onValueChange={(value) =>
                        setJobSort(value as "cost" | "score" | "recent")
                      }
                    >
                      <SelectTrigger
                        className="w-[180px]"
                        aria-label="Sort jobs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cost">
                          Most expensive first
                        </SelectItem>
                        <SelectItem value="score">
                          Highest score first
                        </SelectItem>
                        <SelectItem value="recent">Recently applied</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">
                      {jobRows.length.toLocaleString()} jobs ·{" "}
                      {formatUsd(sumCost(jobRows))}
                    </span>
                  </div>
                  {jobRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No jobs with AI spend match this filter.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Job</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead>Spent on</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobRows.slice(0, 300).map((row) => (
                            <TableRow key={row.jobId}>
                              <TableCell className="min-w-[200px]">
                                {row.title ? (
                                  <Link
                                    to={`/job/${row.jobId}`}
                                    className="font-medium hover:underline"
                                  >
                                    {row.title}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Deleted job
                                  </span>
                                )}
                                {row.employer ? (
                                  <div className="text-xs text-muted-foreground">
                                    {row.employer}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                {row.status
                                  ? (STATUS_LABELS[row.status] ?? row.status)
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.suitabilityScore ?? "-"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {Object.entries(row.byFeature)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(
                                    ([feature, cost]) =>
                                      `${featureLabel(feature)} ${formatUsd(cost)}`,
                                  )
                                  .join(" · ")}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatUsd(row.cost)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {jobRows.length > 300 ? (
                        <p className="pt-2 text-xs text-muted-foreground">
                          Showing the first 300 of{" "}
                          {jobRows.length.toLocaleString()} jobs.
                        </p>
                      ) : null}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="models">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Model</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">In</TableHead>
                          <TableHead className="text-right">Out</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byModel.map((row) => (
                          <TableRow key={row.model}>
                            <TableCell className="font-mono text-xs">
                              {row.model}
                              {row.priced ? null : (
                                <span className="ml-2 font-sans text-warning">
                                  no price
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.calls.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatTokens(
                                row.inputTokens +
                                  row.cacheReadTokens +
                                  row.cacheWriteTokens,
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatTokens(row.outputTokens)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatUsd(row.cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </SectionCard>

            <p className="text-xs text-muted-foreground">
              Token counts come straight from the AI provider. Dollar amounts
              are estimates from the price list; your provider&apos;s bill is
              the final word.
            </p>
          </>
        )}
      </PageFrame>

      <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
    </>
  );
}

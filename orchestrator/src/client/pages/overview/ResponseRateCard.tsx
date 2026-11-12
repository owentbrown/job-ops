import { isExtractorSourceId, sourceLabel } from "@shared/extractors";
import type { OverviewScoreBandRow, OverviewSourceRow } from "@shared/types.js";
import type React from "react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canShowRate, percent, rateLabel } from "./format";

type Dimension = "score" | "role" | "source";

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "role", label: "Role" },
  { value: "source", label: "Source" },
];

type RateRow = {
  key: string;
  label: string;
  detail?: string;
  applied: number;
  replied: number;
};

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

/** One row per group: label, "7 of 18 · 39%", and a bar once readable. */
const RateRows: React.FC<{ rows: RateRow[]; showRates: boolean }> = ({
  rows,
  showRates,
}) => (
  <ul className="space-y-3">
    {rows.map((r) => (
      <li key={r.key} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="min-w-0 truncate">
            {r.label}
            {r.detail ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {r.detail}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 font-mono tabular-nums">
            {/* 0% before anyone has replied reads as failure, not data. */}
            {showRates
              ? rateLabel(r.replied, r.applied)
              : `${r.applied} applied`}
          </span>
        </div>
        {showRates && canShowRate(r.applied) ? (
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
);

export function scoreTakeaway(rows: OverviewScoreBandRow[]): string {
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

const ScoreView: React.FC<{ rows: OverviewScoreBandRow[] }> = ({ rows }) => {
  const totalReplied = rows.reduce((sum, r) => sum + r.replied, 0);
  const anyReadable = rows.some((r) => canShowRate(r.applied));
  if (!anyReadable || totalReplied === 0) {
    return (
      <Hint>
        Fills in after your first reply and a few applications in each band.
      </Hint>
    );
  }
  return (
    <>
      <RateRows
        showRates
        rows={rows.map((r) => ({ key: r.band, label: r.band, ...r }))}
      />
      <p className="text-xs text-muted-foreground">{scoreTakeaway(rows)}</p>
    </>
  );
};

const SourceView: React.FC<{ rows: OverviewSourceRow[] }> = ({ rows }) => {
  if (rows.length === 0) return <Hint>No jobs found in this range.</Hint>;
  const anyReplies = rows.some((r) => r.replied > 0);
  return (
    <>
      <RateRows
        showRates={anyReplies}
        rows={rows.map((r) => ({
          key: r.source,
          label: isExtractorSourceId(r.source)
            ? sourceLabel(r.source)
            : r.source,
          detail: `${r.results} found`,
          applied: r.applied,
          replied: r.replied,
        }))}
      />
      {!anyReplies ? (
        <p className="text-xs text-muted-foreground">
          Reply rates appear after your first reply.
        </p>
      ) : null}
    </>
  );
};

export const ResponseRateCard: React.FC<{
  scoreBands: OverviewScoreBandRow[];
  sources: OverviewSourceRow[];
}> = ({ scoreBands, sources }) => {
  const [dimension, setDimension] = useState<Dimension>("score");
  return (
    <Card>
      <CardContent className="space-y-4 pt-(--density-pad)">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Response rate by…</h3>
          <Tabs
            value={dimension}
            onValueChange={(v) => setDimension(v as Dimension)}
          >
            <TabsList aria-label="Group response rate by">
              {DIMENSIONS.map((d) => (
                <TabsTrigger key={d.value} value={d.value}>
                  {d.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        {dimension === "score" ? <ScoreView rows={scoreBands} /> : null}
        {dimension === "role" ? (
          <Hint>Appears once applications are categorized by role.</Hint>
        ) : null}
        {dimension === "source" ? <SourceView rows={sources} /> : null}
      </CardContent>
    </Card>
  );
};

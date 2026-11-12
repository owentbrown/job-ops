import * as api from "@client/api";
import {
  DurationSelector,
  type DurationValue,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import { OVERVIEW_RANGES } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import type React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { queryKeys } from "@/client/lib/queryKeys";
import { ActionTiles } from "./overview/ActionTiles";
import { EngineStatusStrip } from "./overview/EngineStatusStrip";
import { PaceCard } from "./overview/PaceCard";
import { PipelineCard } from "./overview/PipelineCard";
import { RepliesCard } from "./overview/RepliesCard";
import { RolesCard } from "./overview/RolesCard";
import { ScoreBandsCard } from "./overview/ScoreBandsCard";
import { SectionHeader } from "./overview/SectionHeader";
import { SkipsCard } from "./overview/SkipsCard";
import { SourceYieldTable } from "./overview/SourceYieldTable";

const DEFAULT_RANGE: DurationValue = 30;
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const OverviewPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = Number(searchParams.get("duration"));
  const range: DurationValue = (OVERVIEW_RANGES as readonly number[]).includes(
    fromUrl,
  )
    ? (fromUrl as DurationValue)
    : DEFAULT_RANGE;

  const setRange = (next: DurationValue) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === DEFAULT_RANGE) params.delete("duration");
      else params.set("duration", String(next));
      return params;
    });

  const overview = useQuery({
    queryKey: queryKeys.overview.data(range),
    queryFn: () => api.getOverview({ range, timeZone }),
  });
  const progress = useQuery({
    queryKey: queryKeys.pipeline.progressSnapshot(),
    queryFn: api.getPipelineProgressSnapshot,
    refetchInterval: 15_000,
  });
  const status = useQuery({
    queryKey: queryKeys.pipeline.status(),
    queryFn: api.getPipelineStatus,
    refetchInterval: 30_000,
  });
  const schedule = useQuery({
    queryKey: queryKeys.pipeline.schedule(),
    queryFn: api.getSearchSchedule,
  });
  useQueryErrorToast(overview.error, "Failed to load the overview");

  const challenge =
    progress.data?.step === "challenge_required"
      ? (progress.data.pendingChallenges?.[0] ?? null)
      : null;
  const data = overview.data;

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Overview"
        subtitle="Your search at a glance"
        actions={<DurationSelector value={range} onChange={setRange} />}
      />
      <PageMain className="space-y-10">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {overview.isLoading
              ? "Loading…"
              : "The overview couldn't be loaded."}
          </p>
        ) : (
          <>
            <section aria-labelledby="ov-pipeline">
              <SectionHeader index="01" title="Pipeline" id="ov-pipeline" />
              <PipelineCard pipeline={data.pipeline} />
            </section>

            <section aria-labelledby="ov-action">
              <SectionHeader
                index="02"
                title="Needs your action"
                id="ov-action"
              />
              <ActionTiles
                actions={data.actions}
                challenge={
                  challenge ? { extractorName: challenge.extractorName } : null
                }
              />
              <EngineStatusStrip
                schedule={schedule.data ?? null}
                lastRun={status.data?.lastRun ?? null}
                allJobsCount={data.actions.allJobsCount}
              />
            </section>

            <section aria-labelledby="ov-insights" className="space-y-4">
              <SectionHeader index="03" title="Insights" id="ov-insights" />
              <div className="grid gap-4 lg:grid-cols-2">
                <PaceCard pace={data.pace} />
                <RepliesCard replies={data.replies} />
                <RolesCard />
                <SkipsCard highScoreSkipped={data.skips.highScoreSkipped} />
              </div>
              <SourceYieldTable rows={data.sources.rows} />
              <ScoreBandsCard rows={data.scoreBands.rows} />
            </section>
          </>
        )}
      </PageMain>
    </>
  );
};

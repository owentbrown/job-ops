import type { PipelineRun, SearchScheduleStatus } from "@shared/types.js";
import type React from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleText(
  s: Pick<SearchScheduleStatus, "enabled" | "hour" | "days"> | null,
): string {
  if (!s?.enabled) return "Not scheduled";
  const time = new Date(2000, 0, 1, s.hour).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const days =
    s.days.length === 7 ? "Daily" : s.days.map((d) => DAY_NAMES[d]).join(", ");
  return `${days} ${time}`;
}

export const EngineStatusStrip: React.FC<{
  schedule: Pick<SearchScheduleStatus, "enabled" | "hour" | "days"> | null;
  lastRun: Pick<
    PipelineRun,
    "startedAt" | "status" | "jobsDiscovered" | "jobsProcessed"
  > | null;
  allJobsCount: number;
}> = ({ schedule, lastRun, allJobsCount }) => {
  const parts = [
    "Search engine",
    scheduleText(schedule),
    lastRun
      ? `Last run ${new Date(lastRun.startedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}${lastRun.status === "failed" ? " (failed)" : ""}`
      : "No runs yet",
    ...(lastRun
      ? [`${lastRun.jobsDiscovered} found`, `${lastRun.jobsProcessed} scored`]
      : []),
    `${allJobsCount} all jobs`,
  ];
  return (
    <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 rounded-lg border border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? (
            <span aria-hidden className="mr-2">
              ·
            </span>
          ) : null}
          {p}
        </span>
      ))}
    </p>
  );
};

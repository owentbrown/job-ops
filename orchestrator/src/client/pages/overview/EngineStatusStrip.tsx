import type {
  PipelineRun,
  PipelineRunTally,
  SearchScheduleStatus,
} from "@shared/types.js";
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

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "today at 6 AM", "yesterday at 6:15 AM", or "Nov 12, 8:00 AM". */
export function when(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const day = sameDay(d, now)
    ? "today"
    : sameDay(d, yesterday)
      ? "yesterday"
      : null;
  if (day) {
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      ...(d.getMinutes() === 0 ? {} : { minute: "2-digit" }),
    });
    return `${day} at ${time}`;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Why the newest search didn't count, if it didn't: it failed, it's waiting
 * for the internet, or it came back with nothing at all.
 */
function problemText(
  schedule: Pick<SearchScheduleStatus, "lastScheduledRun"> | null,
  lastRun: Pick<
    PipelineRun,
    "id" | "startedAt" | "status" | "jobsDiscovered" | "errorMessage"
  > | null,
  lastSuccessfulRun: Pick<PipelineRunTally, "id"> | null,
): string | null {
  const scheduled = schedule?.lastScheduledRun;
  if (scheduled?.outcome === "offline") {
    return `Scheduled search ${when(scheduled.at)} is waiting: ${scheduled.message ?? "no internet connection"}`;
  }
  if (!lastRun || lastRun.id === lastSuccessfulRun?.id) return null;
  if (lastRun.status === "failed") {
    return `Last search ${when(lastRun.startedAt)} failed${lastRun.errorMessage ? `: ${lastRun.errorMessage}` : ""}`;
  }
  if (lastRun.status === "completed" && lastRun.jobsDiscovered === 0) {
    return `Last search ${when(lastRun.startedAt)} got nothing back from the job sites`;
  }
  return null;
}

export const EngineStatusStrip: React.FC<{
  schedule:
    | (Pick<SearchScheduleStatus, "enabled" | "hour" | "days"> &
        Partial<Pick<SearchScheduleStatus, "lastScheduledRun">>)
    | null;
  lastRun:
    | (Pick<
        PipelineRun,
        "startedAt" | "status" | "jobsDiscovered" | "jobsProcessed"
      > &
        Partial<Pick<PipelineRun, "id" | "errorMessage">>)
    | null;
  lastSuccessfulRun?: PipelineRunTally | null;
  allJobsCount: number;
}> = ({ schedule, lastRun, lastSuccessfulRun = null, allJobsCount }) => {
  const ok = lastSuccessfulRun;
  const parts = [
    "Search engine",
    scheduleText(schedule),
    ok ? `Last successful run ${when(ok.startedAt)}` : "No successful runs yet",
    ...(ok
      ? [
          `${ok.jobsDiscovered} scanned`,
          ...(ok.jobsScored != null ? [`${ok.jobsScored} scored`] : []),
          `${ok.jobsProcessed} ready`,
        ]
      : []),
    `${allJobsCount} all jobs`,
  ];
  const problem = problemText(
    schedule?.lastScheduledRun !== undefined
      ? { lastScheduledRun: schedule.lastScheduledRun }
      : null,
    lastRun
      ? {
          id: lastRun.id ?? "",
          startedAt: lastRun.startedAt,
          status: lastRun.status,
          jobsDiscovered: lastRun.jobsDiscovered,
          errorMessage: lastRun.errorMessage ?? null,
        }
      : null,
    ok,
  );
  return (
    <div className="mt-3 space-y-1">
      <p className="flex flex-wrap gap-x-2 gap-y-1 rounded-lg border border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
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
      {problem ? (
        <output className="block px-4 text-xs text-warning">{problem}</output>
      ) : null}
    </div>
  );
};

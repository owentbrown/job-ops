import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import type {
  SearchScheduleStatus,
  UpdateSearchScheduleInput,
} from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DAY_LONG,
  DAY_SHORT,
  daysForFrequency,
  describeDays,
  FREQUENCY_LABELS,
  frequencyFromDays,
  type ScheduleFrequency,
  toggleDay,
} from "./scheduleDays";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatHour(hour: number): string {
  const date = new Date(2000, 0, 1, hour);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describeLastSearch(status: SearchScheduleStatus | undefined): string {
  const last = status?.lastSearch;
  if (!last || last.source === "none") {
    return "No search to repeat yet. Run Find jobs once first.";
  }
  const where = [last.cityLocations.join(", "), last.country]
    .filter(Boolean)
    .join(" · ");
  const sources = last.sources.length
    ? `${last.sources.length} source${last.sources.length === 1 ? "" : "s"}`
    : "default sources";
  return `${sources}${where ? ` · ${where}` : ""} · current search terms`;
}

interface SearchScheduleControlsProps {
  isPipelineRunning: boolean;
  onRunLastSearch: () => void;
}

export const SearchScheduleControls: React.FC<SearchScheduleControlsProps> = ({
  isPipelineRunning,
  onRunLastSearch,
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const scheduleQuery = useQuery({
    queryKey: queryKeys.pipeline.schedule(),
    queryFn: api.getSearchSchedule,
    staleTime: 30_000,
  });
  const status = scheduleQuery.data;
  const [capDraft, setCapDraft] = useState("");
  // Kept locally so "Custom days" stays picked even when the chosen days
  // happen to match a preset.
  const [frequency, setFrequency] = useState<ScheduleFrequency>("daily");

  useEffect(() => {
    if (status) setCapDraft(String(status.maxJobsToScore));
  }, [status]);

  const savedDaysKey = status?.days.join(",") ?? "";
  useEffect(() => {
    if (!savedDaysKey) return;
    setFrequency((current) =>
      current === "custom"
        ? current
        : frequencyFromDays(savedDaysKey.split(",").map(Number)),
    );
  }, [savedDaysKey]);

  // Refresh after a run finishes so "last search" / last outcome stay current.
  useEffect(() => {
    if (isPipelineRunning) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.pipeline.schedule(),
    });
  }, [isPipelineRunning, queryClient]);

  const update = useMutation({
    mutationFn: (input: UpdateSearchScheduleInput) =>
      api.updateSearchSchedule(input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.pipeline.schedule(), data);
    },
    onError: (error) =>
      showErrorToast(error, "Failed to save scheduled search"),
  });

  const save = (input: UpdateSearchScheduleInput) =>
    update.mutate({ ...input, timeZone: browserTimeZone() });

  const commitCap = () => {
    const value = Number.parseInt(capDraft, 10);
    if (!Number.isFinite(value) || value < 1 || value > 500) {
      toast.error("Score cap must be between 1 and 500");
      if (status) setCapDraft(String(status.maxJobsToScore));
      return;
    }
    if (value !== status?.maxJobsToScore) save({ maxJobsToScore: value });
  };

  const hasLastSearch = Boolean(status && status.lastSearch.source !== "none");
  const enabled = status?.enabled ?? false;
  const days = status?.days ?? [0, 1, 2, 3, 4, 5, 6];
  const busy = !status || update.isPending;

  const changeFrequency = (next: ScheduleFrequency) => {
    setFrequency(next);
    const nextDays = daysForFrequency(next, days);
    if (nextDays.join(",") !== days.join(",")) save({ days: nextDays });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={onRunLastSearch}
        disabled={isPipelineRunning || !hasLastSearch}
        title={describeLastSearch(status)}
      >
        <RotateCcw className="h-4 w-4" />
        <span className="hidden sm:inline">Repeat last search</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={enabled ? "secondary" : "ghost"}
            className="gap-2"
            aria-label="Scheduled search"
          >
            <CalendarClock className="h-4 w-4" />
            <span className="hidden md:inline">
              {enabled && status
                ? `${describeDays(status.days)} ${formatHour(status.hour)}`
                : "Scheduled search"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="daily-search-enabled" className="font-medium">
                Repeat my last search on a schedule
              </Label>
              <p className="text-xs text-muted-foreground">
                {describeLastSearch(status)}
              </p>
            </div>
            <Switch
              id="daily-search-enabled"
              checked={enabled}
              disabled={!status || update.isPending}
              onCheckedChange={(checked) => save({ enabled: checked })}
            />
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">How often</Label>
              <Select
                value={frequency}
                onValueChange={(value) =>
                  changeFrequency(value as ScheduleFrequency)
                }
                disabled={busy}
              >
                <SelectTrigger className="h-8" aria-label="How often">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as ScheduleFrequency[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {FREQUENCY_LABELS[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {frequency === "weekly" ? (
              <div className="space-y-1">
                <Label className="text-xs">Day</Label>
                <Select
                  value={String(days[0] ?? 1)}
                  onValueChange={(value) =>
                    save({ days: [Number.parseInt(value, 10)] })
                  }
                  disabled={busy}
                >
                  <SelectTrigger className="h-8" aria-label="Day of the week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LONG.map((label, index) => (
                      <SelectItem key={label} value={String(index)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {frequency === "custom" ? (
              <fieldset className="flex flex-wrap gap-1" aria-label="Days">
                {DAY_SHORT.map((label, index) => {
                  const on = days.includes(index);
                  return (
                    <Button
                      key={label}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      className="h-7 w-10 px-0 text-xs"
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => save({ days: toggleDay(days, index) })}
                    >
                      {label}
                    </Button>
                  );
                })}
              </fieldset>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Time</Label>
              <Select
                value={status ? String(status.hour) : undefined}
                onValueChange={(value) =>
                  save({ hour: Number.parseInt(value, 10) })
                }
                disabled={!status || update.isPending}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Hour" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {formatHour(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="daily-search-cap" className="text-xs">
                Score at most
              </Label>
              <Input
                id="daily-search-cap"
                className="h-8"
                type="number"
                min={1}
                max={500}
                value={capDraft}
                onChange={(event) => setCapDraft(event.target.value)}
                onBlur={commitCap}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitCap();
                }}
                disabled={!status || update.isPending}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Runs unattended: skips the review pause and scores up to{" "}
            {status?.maxJobsToScore ?? 40} jobs (newest first); the rest wait
            for the next run. Sources that need a bot check are skipped. The app
            must be running at that time.
          </p>

          {status?.timeZone && status.timeZone !== browserTimeZone() ? (
            <p className="text-xs text-amber-600">
              Saved for {status.timeZone}. Change any setting to switch to{" "}
              {browserTimeZone()}.
            </p>
          ) : null}

          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {update.isPending ? (
              <p className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </p>
            ) : enabled && status?.nextRunAt ? (
              <p>Next run: {formatWhen(status.nextRunAt)}</p>
            ) : (
              <p>Scheduled search is off.</p>
            )}
            {status?.lastScheduledRun ? (
              <p>
                Last scheduled run: {formatWhen(status.lastScheduledRun.at)} —{" "}
                {status.lastScheduledRun.outcome}
                {status.lastScheduledRun.message
                  ? ` (${status.lastScheduledRun.message})`
                  : ""}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};

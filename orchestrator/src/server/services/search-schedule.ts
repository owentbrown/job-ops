/**
 * Daily scheduled search: once a day, at an hour in the user's own time zone,
 * repeat the last search started from "Find jobs". Scheduled runs go all the
 * way through scoring with no review pause, but score at most
 * `maxJobsToScore` jobs (newest first) so a big haul can't run up the bill.
 *
 * State lives in <dataDir>/search-schedule.json so it survives restarts and
 * needs no schema change.
 *
 * The scheduler checks once a minute whether today's slot has passed without
 * a scheduled run, rather than sleeping until the slot. A laptop that was
 * asleep (lid closed) at the set hour therefore runs the search as soon as it
 * wakes, instead of skipping the day.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "@infra/logger";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { getDataDir } from "@server/config/dataDir";
import { getPipelineStatus } from "@server/pipeline/index";
import * as pipelineRepo from "@server/repositories/pipeline";
import type { PipelineRun, SearchScheduleStatus } from "@shared/types";
import { z } from "zod";
import {
  launchSearch,
  type RunPipelineRequest,
  runPipelineSchema,
} from "./search-launch";

export const DEFAULT_MAX_JOBS_TO_SCORE = 40;
export const MAX_MAX_JOBS_TO_SCORE = 500;

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const daysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day")
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const scheduleFileSchema = z.object({
  enabled: z.boolean().default(false),
  hour: z.number().int().min(0).max(23).default(7),
  /** Days of the week to run on, 0 = Sunday … 6 = Saturday. */
  days: daysSchema.default(ALL_DAYS),
  timeZone: z.string().min(1).default("UTC"),
  maxJobsToScore: z
    .number()
    .int()
    .min(1)
    .max(MAX_MAX_JOBS_TO_SCORE)
    .default(DEFAULT_MAX_JOBS_TO_SCORE),
  lastSearch: z.unknown().nullable().default(null),
  lastSearchAt: z.string().nullable().default(null),
  /** When the current schedule took effect; slots before it never run. */
  activeSince: z.string().nullable().default(null),
  lastScheduledRun: z
    .object({
      at: z.string(),
      outcome: z.enum(["started", "skipped", "failed"]),
      message: z.string().optional(),
    })
    .nullable()
    .default(null),
});

type ScheduleFile = z.infer<typeof scheduleFileSchema>;

export type LastSearchSource = SearchScheduleStatus["lastSearch"]["source"];

export function getSearchScheduleFilePath(): string {
  return join(getDataDir(), "search-schedule.json");
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function readFileState(): ScheduleFile {
  const path = getSearchScheduleFilePath();
  if (!existsSync(path)) return scheduleFileSchema.parse({});
  try {
    const parsed = scheduleFileSchema.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (parsed.success) return parsed.data;
    logger.warn("Search schedule file is invalid; using defaults", {
      error: parsed.error.message,
    });
  } catch (error) {
    logger.warn("Search schedule file unreadable; using defaults", { error });
  }
  return scheduleFileSchema.parse({});
}

// Serialise writes so a scheduler tick and a settings save can't interleave.
let writeChain: Promise<void> = Promise.resolve();
function writeFileState(
  update: (current: ScheduleFile) => ScheduleFile,
): Promise<ScheduleFile> {
  const next = writeChain.then(async () => {
    const updated = update(readFileState());
    const path = getSearchScheduleFilePath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    await rename(tmp, path);
    return updated;
  });
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function slotMatcher(hour: number, timeZone: string, days: number[]) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const allowed = new Set(days.length > 0 ? days : ALL_DAYS);
  return (candidate: Date): boolean => {
    const parts = fmt.formatToParts(candidate);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    const wd =
      WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? ""];
    return h === hour && m === 0 && allowed.has(wd);
  };
}

const STEP_MS = 15 * 60 * 1000;
// Eight days of 15-minute steps covers a once-a-week schedule plus DST.
const MAX_STEPS = 4 * 24 * 8;

/**
 * Next time the wall clock in `timeZone` reads `hour`:00 on one of `days`,
 * strictly after `now`. Steps in 15-minute increments so half-hour-offset
 * zones and DST both work.
 */
export function computeNextRunAt(
  hour: number,
  timeZone: string,
  now: Date = new Date(),
  days: number[] = ALL_DAYS,
): Date {
  const matches = slotMatcher(hour, timeZone, days);
  const start = Math.floor(now.getTime() / STEP_MS) * STEP_MS;
  for (let i = 1; i <= MAX_STEPS; i++) {
    const candidate = new Date(start + i * STEP_MS);
    if (matches(candidate)) return candidate;
  }
  // Unreachable for real zones; fall back to 24h from now.
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Latest time at or before `now` when the wall clock in `timeZone` read
 * `hour`:00 on one of `days`.
 */
export function computePreviousRunAt(
  hour: number,
  timeZone: string,
  now: Date = new Date(),
  days: number[] = ALL_DAYS,
): Date {
  const matches = slotMatcher(hour, timeZone, days);
  const start = Math.floor(now.getTime() / STEP_MS) * STEP_MS;
  for (let i = 0; i <= MAX_STEPS; i++) {
    const candidate = new Date(start - i * STEP_MS);
    if (matches(candidate)) return candidate;
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * True when the most recent daily slot has passed with no scheduled run since
 * it (including one missed while the machine slept), and that slot falls
 * after the schedule was switched on or last changed.
 */
export function isScheduledRunDue(
  state: Pick<
    ScheduleFile,
    "enabled" | "hour" | "timeZone" | "activeSince" | "lastScheduledRun"
  > &
    Partial<Pick<ScheduleFile, "days">>,
  now: Date = new Date(),
): boolean {
  if (!state.enabled || !state.activeSince) return false;
  const slot = computePreviousRunAt(
    state.hour,
    state.timeZone,
    now,
    state.days,
  ).getTime();
  if (slot <= Date.parse(state.activeSince)) return false;
  const lastAt = state.lastScheduledRun
    ? Date.parse(state.lastScheduledRun.at)
    : Number.NEGATIVE_INFINITY;
  return lastAt < slot;
}

/** Rebuild a "Find jobs" request from a stored run (pre-feature history). */
function requestFromRun(run: PipelineRun): RunPipelineRequest | null {
  const snap = run.configSnapshot;
  if (!snap) return null;
  const intent = snap.locationIntent;
  const parsed = runPipelineSchema.safeParse({
    topN: snap.topN,
    minSuitabilityScore: snap.minSuitabilityScore,
    sources: snap.sources,
    country: intent?.selectedCountry ?? undefined,
    cityLocations: intent?.cityLocations ?? undefined,
    proximity: intent?.proximity ?? null,
    workplaceTypes: intent?.workplaceTypes ?? undefined,
    searchScope: intent?.searchScope ?? undefined,
    matchStrictness: intent?.matchStrictness ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The search to repeat: the last one started from "Find jobs", or failing
 * that the newest past run that actually crawled (backlog-only runs carry
 * default sources, not the user's choice).
 */
export async function resolveLastSearch(): Promise<{
  request: RunPipelineRequest | null;
  source: LastSearchSource;
  at: string | null;
}> {
  const state = readFileState();
  if (state.lastSearch) {
    const parsed = runPipelineSchema.safeParse(state.lastSearch);
    if (parsed.success) {
      return {
        request: parsed.data,
        source: "recorded",
        at: state.lastSearchAt,
      };
    }
  }
  const runs = await pipelineRepo.getRecentPipelineRuns(25);
  for (const run of runs) {
    if (run.jobsDiscovered <= 0) continue;
    const request = requestFromRun(run);
    if (request) return { request, source: "history", at: run.startedAt };
  }
  return { request: null, source: "none", at: null };
}

/** Called after every search the user starts by hand. */
export async function recordLastSearch(
  request: RunPipelineRequest,
): Promise<void> {
  try {
    // Search terms are stored in settings and re-read at run time, so a
    // repeat always uses the current list rather than a stale copy.
    const { searchTerms: _terms, ...rest } = request;
    await writeFileState((current) => ({
      ...current,
      lastSearch: rest,
      lastSearchAt: new Date().toISOString(),
    }));
  } catch (error) {
    logger.warn("Could not record last search", { error });
  }
}

// ---------------------------------------------------------------- scheduler

const CHECK_INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let nextRunAt: Date | null = null;
let tickInFlight = false;

function clearTimer(): void {
  if (timer) clearInterval(timer);
  timer = null;
  nextRunAt = null;
}

function refreshNextRunAt(state: ScheduleFile): void {
  nextRunAt = state.enabled
    ? computeNextRunAt(state.hour, state.timeZone, new Date(), state.days)
    : null;
}

/** Run the search if a slot is due (on time, or caught up after sleep). */
export async function checkScheduledSearch(
  now: Date = new Date(),
): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const state = readFileState();
    if (isScheduledRunDue(state, now)) {
      const slot = computePreviousRunAt(
        state.hour,
        state.timeZone,
        now,
        state.days,
      );
      logger.info("Scheduled search due", {
        slot: slot.toISOString(),
        late: now.getTime() - slot.getTime() > 2 * CHECK_INTERVAL_MS,
      });
      await runScheduledSearch();
    }
    if (timer) refreshNextRunAt(readFileState());
  } finally {
    tickInFlight = false;
  }
}

function armTimer(state: ScheduleFile): void {
  clearTimer();
  if (!state.enabled) return;
  refreshNextRunAt(state);
  logger.info("Scheduled search armed", {
    nextRunAt: nextRunAt?.toISOString(),
  });
  timer = setInterval(() => {
    void checkScheduledSearch();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  // Catch up straight away if the slot passed while the app was down.
  void checkScheduledSearch();
}

async function recordOutcome(
  outcome: "started" | "skipped" | "failed",
  message?: string,
): Promise<void> {
  try {
    await writeFileState((current) => ({
      ...current,
      lastScheduledRun: { at: new Date().toISOString(), outcome, message },
    }));
  } catch (error) {
    logger.warn("Could not record scheduled search outcome", { error });
  }
}

/** One scheduled tick. Never throws. */
export async function runScheduledSearch(): Promise<void> {
  try {
    const state = readFileState();
    if (getPipelineStatus().isRunning) {
      logger.info("Scheduled search skipped: a search is already running");
      await recordOutcome("skipped", "Another search was already running");
      return;
    }
    const { request } = await resolveLastSearch();
    if (!request) {
      await recordOutcome(
        "skipped",
        "No previous search to repeat. Run Find jobs once first.",
      );
      return;
    }
    await launchSearch(request, {
      scheduled: { maxJobsToScore: state.maxJobsToScore },
      dropIncompatibleSources: true,
    });
    logger.info("Scheduled search started", {
      maxJobsToScore: state.maxJobsToScore,
    });
    await recordOutcome(
      "started",
      `Scoring capped at ${state.maxJobsToScore} jobs`,
    );
  } catch (error) {
    logger.error("Scheduled search failed to start", { error });
    await recordOutcome(
      "failed",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export async function startSearchScheduler(): Promise<void> {
  // Background ticks have no signed-in user, which hosted mode requires.
  if (getJobOpsAppConfig().appMode === "hosted") return;
  let state = readFileState();
  if (state.enabled && !state.activeSince) {
    // Schedules saved before catch-up existed: start counting from now
    // rather than firing for slots that passed long ago.
    state = await writeFileState((current) => ({
      ...current,
      activeSince: new Date().toISOString(),
    }));
  }
  armTimer(state);
  if (state.enabled) {
    console.log(
      `✅ Scheduled search on (${state.days.length === 7 ? "daily" : `days ${state.days.join(",")}`} ${String(state.hour).padStart(2, "0")}:00 ${state.timeZone}, score cap ${state.maxJobsToScore})`,
    );
  }
}

export function stopSearchScheduler(): void {
  clearTimer();
}

export async function getSearchScheduleStatus(): Promise<SearchScheduleStatus> {
  const state = readFileState();
  const last = await resolveLastSearch();
  return {
    enabled: state.enabled,
    hour: state.hour,
    days: state.days,
    timeZone: state.timeZone,
    maxJobsToScore: state.maxJobsToScore,
    nextRunAt: state.enabled && nextRunAt ? nextRunAt.toISOString() : null,
    lastScheduledRun: state.lastScheduledRun,
    lastSearch: {
      source: last.source,
      at: last.at,
      sources: last.request?.sources ?? [],
      country: last.request?.country ?? null,
      cityLocations: last.request?.cityLocations ?? [],
      topN: last.request?.topN ?? null,
    },
  };
}

export const updateSearchScheduleSchema = z
  .object({
    enabled: z.boolean().optional(),
    hour: z.number().int().min(0).max(23).optional(),
    days: daysSchema.optional(),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, "Unknown time zone")
      .optional(),
    maxJobsToScore: z
      .number()
      .int()
      .min(1)
      .max(MAX_MAX_JOBS_TO_SCORE)
      .optional(),
  })
  .strict();

export async function updateSearchSchedule(
  patch: z.infer<typeof updateSearchScheduleSchema>,
): Promise<SearchScheduleStatus> {
  const updated = await writeFileState((current) => {
    const next: ScheduleFile = {
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
    };
    // Switching on or moving the hour starts afresh: a slot already passed
    // today shouldn't fire the moment the setting is saved.
    const timingChanged =
      (next.enabled && !current.enabled) ||
      next.hour !== current.hour ||
      next.timeZone !== current.timeZone ||
      next.days.join(",") !== current.days.join(",");
    if (next.enabled && (timingChanged || !next.activeSince)) {
      next.activeSince = new Date().toISOString();
    }
    return next;
  });
  armTimer(updated);
  return getSearchScheduleStatus();
}

export function getNextScheduledSearchRun(): string | null {
  return nextRunAt?.toISOString() ?? null;
}

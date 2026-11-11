/**
 * Builds the Spend page report (fork: spend): recorded AI calls in a date
 * range, priced with the current price table and grouped by day, task,
 * model, pipeline run and job.
 */
import { db, schema } from "@server/db";
import { privateDataScopeFilter } from "@server/tenancy/private-scope";
import type {
  SpendBucket,
  SpendJobRow,
  SpendReport,
  SpendRunRow,
} from "@shared/types";
import { and, asc, gte, inArray, lt } from "drizzle-orm";
import { costOf, findModelPrice, getPriceTable } from "./pricing";

const { llmUsage, jobs, pipelineRuns } = schema;

type UsageRow = typeof llmUsage.$inferSelect;

function emptyBucket(): SpendBucket {
  return {
    cost: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
}

function add(bucket: SpendBucket, row: UsageRow, cost: number): void {
  bucket.cost += cost;
  bucket.calls += 1;
  bucket.inputTokens += row.inputTokens;
  bucket.outputTokens += row.outputTokens;
  bucket.cacheWriteTokens += row.cacheWriteTokens;
  bucket.cacheReadTokens += row.cacheReadTokens;
}

function dayKey(iso: string, fmt: Intl.DateTimeFormat): string {
  // en-CA formats as YYYY-MM-DD.
  return fmt.format(new Date(iso));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function getUsageRows(args: {
  from?: string | null;
  to?: string | null;
}): Promise<UsageRow[]> {
  const filters = [privateDataScopeFilter(llmUsage)];
  if (args.from) filters.push(gte(llmUsage.createdAt, args.from));
  if (args.to) filters.push(lt(llmUsage.createdAt, args.to));
  return db
    .select()
    .from(llmUsage)
    .where(and(...filters))
    .orderBy(asc(llmUsage.createdAt));
}

async function getTrackingSince(): Promise<string | null> {
  const [first] = await db
    .select({ createdAt: llmUsage.createdAt })
    .from(llmUsage)
    .where(privateDataScopeFilter(llmUsage))
    .orderBy(asc(llmUsage.createdAt))
    .limit(1);
  return first?.createdAt ?? null;
}

export async function buildSpendReport(args: {
  from?: string | null;
  to?: string | null;
  timeZone?: string | null;
}): Promise<SpendReport> {
  const timeZone = args.timeZone || "UTC";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const rows = await getUsageRows(args);
  const { models: prices } = getPriceTable();

  const totals = emptyBucket();
  const unattributed = emptyBucket();
  const byDay = new Map<string, { cost: number; calls: number }>();
  const byFeature = new Map<string, SpendBucket>();
  const byModel = new Map<string, SpendBucket & { priced: boolean }>();
  const byRun = new Map<string, SpendBucket & { jobs: Set<string> }>();
  const byJob = new Map<
    string,
    SpendBucket & { byFeature: Record<string, number> }
  >();
  const unpriced = new Set<string>();

  for (const row of rows) {
    const price = findModelPrice(row.model, prices);
    if (!price) unpriced.add(row.model);
    const cost = price ? costOf(row, price) : 0;

    add(totals, row, cost);

    const day = dayKey(row.createdAt, fmt);
    const d = byDay.get(day) ?? { cost: 0, calls: 0 };
    d.cost += cost;
    d.calls += 1;
    byDay.set(day, d);

    const f = byFeature.get(row.feature) ?? emptyBucket();
    add(f, row, cost);
    byFeature.set(row.feature, f);

    const m = byModel.get(row.model) ?? { ...emptyBucket(), priced: !!price };
    add(m, row, cost);
    byModel.set(row.model, m);

    if (row.pipelineRunId) {
      const r = byRun.get(row.pipelineRunId) ?? {
        ...emptyBucket(),
        jobs: new Set<string>(),
      };
      add(r, row, cost);
      if (row.jobId) r.jobs.add(row.jobId);
      byRun.set(row.pipelineRunId, r);
    }

    if (row.jobId) {
      const j = byJob.get(row.jobId) ?? { ...emptyBucket(), byFeature: {} };
      add(j, row, cost);
      j.byFeature[row.feature] = (j.byFeature[row.feature] ?? 0) + cost;
      byJob.set(row.jobId, j);
    } else if (!row.pipelineRunId) {
      add(unattributed, row, cost);
    }
  }

  // Look up job and run details in chunks (SQLite caps bound parameters).
  const jobInfo = new Map<string, typeof jobs.$inferSelect>();
  for (const ids of chunk([...byJob.keys()], 500)) {
    const found = await db
      .select()
      .from(jobs)
      .where(and(privateDataScopeFilter(jobs), inArray(jobs.id, ids)));
    for (const job of found) jobInfo.set(job.id, job);
  }
  const runInfo = new Map<string, typeof pipelineRuns.$inferSelect>();
  for (const ids of chunk([...byRun.keys()], 500)) {
    const found = await db
      .select()
      .from(pipelineRuns)
      .where(
        and(
          privateDataScopeFilter(pipelineRuns),
          inArray(pipelineRuns.id, ids),
        ),
      );
    for (const run of found) runInfo.set(run.id, run);
  }

  const runs: SpendRunRow[] = [...byRun.entries()]
    .map(([runId, bucket]) => {
      const run = runInfo.get(runId);
      const { jobs: touched, ...rest } = bucket;
      return {
        ...rest,
        runId,
        startedAt: run?.startedAt ?? null,
        status: run?.status ?? null,
        jobsDiscovered: run?.jobsDiscovered ?? null,
        jobsTouched: touched.size,
      };
    })
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

  const jobRows: SpendJobRow[] = [...byJob.entries()]
    .map(([jobId, bucket]) => {
      const job = jobInfo.get(jobId);
      return {
        ...bucket,
        jobId,
        title: job?.title ?? null,
        employer: job?.employer ?? null,
        status: job?.status ?? null,
        suitabilityScore: job?.suitabilityScore ?? null,
        appliedAt: job?.appliedAt ?? null,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  return {
    from: args.from ?? null,
    to: args.to ?? null,
    timeZone,
    trackingSince: await getTrackingSince(),
    totals,
    byDay: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byModel: [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost),
    runs,
    jobs: jobRows,
    unattributed,
    unpricedModels: [...unpriced].sort(),
  };
}

/** Cost per pipeline run id, for the run list. */
export async function getRunCosts(
  runIds: string[],
): Promise<Record<string, number>> {
  if (runIds.length === 0) return {};
  const { models: prices } = getPriceTable();
  const out: Record<string, number> = {};
  for (const ids of chunk(runIds, 500)) {
    const rows = await db
      .select()
      .from(llmUsage)
      .where(
        and(
          privateDataScopeFilter(llmUsage),
          inArray(llmUsage.pipelineRunId, ids),
        ),
      );
    for (const row of rows) {
      if (!row.pipelineRunId) continue;
      const price = findModelPrice(row.model, prices);
      out[row.pipelineRunId] =
        (out[row.pipelineRunId] ?? 0) + (price ? costOf(row, price) : 0);
    }
  }
  return out;
}

export async function getSeenModels(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ model: llmUsage.model })
    .from(llmUsage)
    .where(privateDataScopeFilter(llmUsage));
  return rows.map((r) => r.model).sort();
}

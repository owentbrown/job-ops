/** AI spend tracking (fork: spend). All costs are USD estimates. */

export interface SpendTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface SpendBucket extends SpendTokens {
  cost: number;
  calls: number;
}

export interface SpendModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface SpendRunRow extends SpendBucket {
  runId: string;
  startedAt: string | null;
  status: string | null;
  jobsDiscovered: number | null;
  /** Jobs that had AI work in this run (scored, title-checked, ...). */
  jobsTouched: number;
}

export interface SpendJobRow extends SpendBucket {
  jobId: string;
  title: string | null;
  employer: string | null;
  /** Null when the job has since been deleted. */
  status: string | null;
  suitabilityScore: number | null;
  appliedAt: string | null;
  byFeature: Record<string, number>;
}

export interface SpendReport {
  from: string | null;
  to: string | null;
  timeZone: string;
  /** When the first call was ever recorded (tracking start). */
  trackingSince: string | null;
  totals: SpendBucket;
  byDay: Array<{ date: string; cost: number; calls: number }>;
  byFeature: Array<{ feature: string } & SpendBucket>;
  byModel: Array<{ model: string; priced: boolean } & SpendBucket>;
  runs: SpendRunRow[];
  jobs: SpendJobRow[];
  /** Spend not tied to any job or run (chat set-up, search terms, ...). */
  unattributed: SpendBucket;
  unpricedModels: string[];
}

export interface SpendPricing {
  models: Record<string, SpendModelPrice>;
  defaults: Record<string, SpendModelPrice>;
  customized: string[];
  /** Models seen in usage, so the editor can offer to price them. */
  seenModels: string[];
}

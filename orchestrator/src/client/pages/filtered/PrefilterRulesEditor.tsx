import type { PrefilterConfigDto, PrefilterPreview } from "@client/api";
import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  configToForm,
  formToConfig,
  type PrefilterFormState,
} from "./prefilter-form";

export const PREFILTER_CONFIG_KEY = ["prefilter", "config"] as const;

const DECISION_CLASS: Record<
  PrefilterPreview["items"][number]["decision"],
  string
> = {
  drop: "text-rose-400",
  undecided: "text-amber-300",
  keep: "text-emerald-400",
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-4 rounded-md border border-border p-4">
    <h2 className="text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

const TextField: React.FC<{
  id: string;
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}> = ({ id, label, hint, value, rows = 6, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    <Textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const NumberField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const ToggleField: React.FC<{
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ id, label, hint, checked, onChange }) => (
  <div className="flex items-start gap-3">
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
    <div className="space-y-0.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  </div>
);

export const PrefilterRulesEditor: React.FC = () => {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: PREFILTER_CONFIG_KEY,
    queryFn: api.getPrefilterConfig,
  });
  const base: PrefilterConfigDto | null = configQuery.data
    ? (configQuery.data.config ?? configQuery.data.defaults)
    : null;
  const [form, setForm] = useState<PrefilterFormState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrefilterPreview | null>(null);

  useEffect(() => {
    if (base && form === null) setForm(configToForm(base));
  }, [base, form]);

  const save = useMutation({
    mutationFn: (config: PrefilterConfigDto) => api.savePrefilterConfig(config),
    onSuccess: (saved) => {
      setNotice(`Saved to ${saved.path}`);
      setForm(configToForm(saved.config));
      void queryClient.invalidateQueries({ queryKey: PREFILTER_CONFIG_KEY });
    },
    onError: (err) => showErrorToast(err, "Rules not saved"),
  });
  const runPreview = useMutation({
    mutationFn: (config: PrefilterConfigDto) => api.previewPrefilter(config),
    onSuccess: setPreview,
    onError: (err) => showErrorToast(err, "Preview failed"),
  });
  const resume = useMutation({
    mutationFn: api.resumePipelineScoring,
    onSuccess: () =>
      setNotice("Resumed: rules → AI title check → scoring are running."),
    onError: (err) => showErrorToast(err, "No paused run to resume"),
  });

  if (configQuery.isLoading || !form || !base) {
    return <p className="text-sm text-muted-foreground">Loading rules…</p>;
  }

  const status = configQuery.data?.status;
  const update = <K extends keyof PrefilterFormState>(
    key: K,
    value: PrefilterFormState[K],
  ) => {
    setNotice(null);
    setForm({ ...form, [key]: value });
  };
  const draft = () => formToConfig(form, base);

  return (
    <div className="space-y-6">
      {status === "missing" ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          No rules file yet. These are defaults; Save creates{" "}
          {configQuery.data?.path}.
        </p>
      ) : null}
      {status === "invalid" ? (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          The rules file is invalid ({configQuery.data?.error}). Showing
          defaults; Save overwrites it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate(draft())} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save rules"}
        </Button>
        <Button
          variant="outline"
          onClick={() => runPreview.mutate(draft())}
          disabled={runPreview.isPending}
        >
          {runPreview.isPending ? "Previewing…" : "Preview (rules only, free)"}
        </Button>
        <Button
          variant="outline"
          onClick={() => resume.mutate()}
          disabled={resume.isPending}
        >
          Resume paused run
        </Button>
      </div>
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}

      {preview ? (
        <Section title={`Preview on ${preview.total} unscored jobs`}>
          <p className="text-sm">
            {preview.counts.drop} dropped by rules · {preview.counts.undecided}{" "}
            go to the AI title check · {preview.counts.keep} go straight to full
            scoring
          </p>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {preview.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3"
              >
                <span
                  className={`w-24 shrink-0 text-xs uppercase ${DECISION_CLASS[item.decision]}`}
                >
                  {item.decision}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {item.title} · {item.employer}
                </span>
                <span className="text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="General">
        <ToggleField
          id="pf-enabled"
          label="Filter enabled"
          hint="Off = every job goes straight to full scoring."
          checked={form.enabled}
          onChange={(v) => update("enabled", v)}
        />
        <ToggleField
          id="pf-pause"
          label="Pause before scoring each run"
          hint="Runs stop after discovery and wait for Resume. Turn off once you trust the rules."
          checked={form.pauseBeforeScoring}
          onChange={(v) => update("pauseBeforeScoring", v)}
        />
      </Section>

      <Section title="Job title">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-include"
            label="Always keep (include)"
            hint="One per line. Overrides excludes and skips the AI check."
            value={form.titleInclude}
            rows={10}
            onChange={(v) => update("titleInclude", v)}
          />
          <TextField
            id="pf-exclude"
            label="Drop (exclude)"
            hint="One per line. Whole words; a trailing 's' also matches."
            value={form.titleExclude}
            rows={10}
            onChange={(v) => update("titleExclude", v)}
          />
        </div>
      </Section>

      <Section title="Company and location">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-company"
            label="Company blocklist"
            value={form.companyBlocklist}
            onChange={(v) => update("companyBlocklist", v)}
          />
          <TextField
            id="pf-commute"
            label="Commute locations to drop"
            hint="Dropped only when the job is not remote."
            value={form.commuteBlocklist}
            onChange={(v) => update("commuteBlocklist", v)}
          />
        </div>
      </Section>

      <Section title="Salary">
        <ToggleField
          id="pf-salary"
          label="Salary floor check"
          hint="Drops only when a listed maximum converts below the floor. Missing salary never drops."
          checked={form.salaryEnabled}
          onChange={(v) => update("salaryEnabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="pf-floor"
            label="Floor (CAD / year)"
            value={form.floorAnnualCad}
            onChange={(v) => update("floorAnnualCad", v)}
          />
          <NumberField
            id="pf-hours"
            label="Hours per year (hourly → annual)"
            value={form.hoursPerYear}
            onChange={(v) => update("hoursPerYear", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="pf-currency">Default currency</Label>
            <Input
              id="pf-currency"
              value={form.defaultCurrency}
              onChange={(e) => update("defaultCurrency", e.target.value)}
            />
          </div>
        </div>
        <TextField
          id="pf-rates"
          label="Rates to CAD"
          hint="One per line, e.g. USD=1.37"
          value={form.ratesToCad}
          rows={4}
          onChange={(v) => update("ratesToCad", v)}
        />
      </Section>

      <Section title="Description">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="pf-harddrop"
            label="Drop when description contains"
            value={form.hardDropPhrases}
            onChange={(v) => update("hardDropPhrases", v)}
          />
          <TextField
            id="pf-flags"
            label="Flag for the AI check (never drops alone)"
            value={form.flagPhrases}
            onChange={(v) => update("flagPhrases", v)}
          />
        </div>
      </Section>

      <Section title="AI title check">
        <ToggleField
          id="pf-llm"
          label="Run the AI title check"
          hint="Batched, cheap. Only 'drop' filters a job; 'keep' and 'maybe' go to full scoring."
          checked={form.llmEnabled}
          onChange={(v) => update("llmEnabled", v)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="pf-batch"
            label="Jobs per call"
            value={form.batchSize}
            onChange={(v) => update("batchSize", v)}
          />
          <NumberField
            id="pf-chars"
            label="Description characters"
            value={form.descriptionChars}
            onChange={(v) => update("descriptionChars", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="pf-model">Model (blank = scoring model)</Label>
            <Input
              id="pf-model"
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
            />
          </div>
        </div>
        <TextField
          id="pf-targets"
          label="Roles I'm targeting"
          value={form.targetRoles}
          rows={5}
          onChange={(v) => update("targetRoles", v)}
        />
        <TextField
          id="pf-hardpasses"
          label="Hard passes"
          value={form.hardPasses}
          rows={4}
          onChange={(v) => update("hardPasses", v)}
        />
      </Section>
    </div>
  );
};

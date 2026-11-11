import type { PrefilterConfigDto, PrefilterPreview } from "@client/api";
import * as api from "@client/api";
import { formatUserFacingError } from "@client/lib/error-format";
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

const NUMBER_FIELDS: Array<[keyof PrefilterFormState, string]> = [
  ["floorAnnualCad", "Floor"],
  ["hoursPerYear", "Hours per year"],
  ["batchSize", "Jobs per call"],
  ["descriptionChars", "Description characters"],
];

/** Client-side checks so obvious typos never reach the server. */
export function validateForm(
  form: PrefilterFormState,
): Partial<Record<keyof PrefilterFormState, string>> {
  const errors: Partial<Record<keyof PrefilterFormState, string>> = {};
  for (const [key, label] of NUMBER_FIELDS) {
    const raw = String(form[key]).trim();
    if (raw === "" || !Number.isFinite(Number(raw))) {
      errors[key] = `${label} must be a number.`;
    }
  }
  if (form.defaultCurrency.trim() === "") {
    errors.defaultCurrency = "Default currency is required.";
  }
  const badRate = form.ratesToCad
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .find((line) => {
      const parts = line.split("=");
      if (parts.length !== 2) return true;
      const code = parts[0].trim();
      const rate = parts[1].trim();
      return code === "" || rate === "" || !Number.isFinite(Number(rate));
    });
  const badNote = form.companyNotes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .find((line) => {
      const colon = line.indexOf(":");
      return colon <= 0 || line.slice(colon + 1).trim() === "";
    });
  const age = form.maxPostingAgeDays.trim();
  if (age !== "" && !/^\d+$/.test(age)) {
    errors.maxPostingAgeDays =
      "Posting age must be a whole number of days, or empty.";
  } else if (age !== "" && (Number(age) < 1 || Number(age) > 365)) {
    errors.maxPostingAgeDays = "Posting age must be between 1 and 365 days.";
  }
  if (badNote) {
    errors.companyNotes = `Company notes must look like Company: note (got "${badNote}").`;
  }
  if (badRate) {
    errors.ratesToCad = `Rate lines must look like CODE=number (got "${badRate}").`;
  }
  return errors;
}

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;

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
  error?: string;
  onChange: (value: string) => void;
}> = ({ id, label, hint, value, rows = 6, error, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    <Textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <FieldError message={error} />
  </div>
);

const NumberField: React.FC<{
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, error, hint, placeholder, onChange }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    <FieldError message={error} />
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

export const PrefilterRulesEditor: React.FC<{
  onDirtyChange?: (dirty: boolean) => void;
}> = ({ onDirtyChange }) => {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: PREFILTER_CONFIG_KEY,
    queryFn: api.getPrefilterConfig,
  });
  const base: PrefilterConfigDto | null = configQuery.data
    ? (configQuery.data.config ?? configQuery.data.defaults)
    : null;
  const [form, setForm] = useState<PrefilterFormState | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrefilterPreview | null>(null);

  useEffect(() => {
    if (base && form === null) {
      const initial = configToForm(base);
      setForm(initial);
      setBaseline(JSON.stringify(initial));
    }
  }, [base, form]);

  const dirty =
    form !== null && baseline !== null && JSON.stringify(form) !== baseline;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: (config: PrefilterConfigDto) => api.savePrefilterConfig(config),
    onSuccess: (saved) => {
      setNotice(`Saved to ${saved.path}`);
      const savedForm = configToForm(saved.config);
      setForm(savedForm);
      setBaseline(JSON.stringify(savedForm));
      setPreview(null);
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
    onSuccess: (result) =>
      setNotice(
        result.resolved
          ? "Resumed: rules → AI title check → scoring are running."
          : "No paused run to resume.",
      ),
    onError: (err) => showErrorToast(err, "No paused run to resume"),
  });

  if (configQuery.isError) {
    return (
      <div className="space-y-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
        <p role="alert">
          {formatUserFacingError(
            configQuery.error,
            "Could not load the rules.",
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void configQuery.refetch()}
          disabled={configQuery.isFetching}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (configQuery.isPending || !form || !base) {
    return <p className="text-sm text-muted-foreground">Loading rules…</p>;
  }

  const status = configQuery.data?.status;
  const update = <K extends keyof PrefilterFormState>(
    key: K,
    value: PrefilterFormState[K],
  ) => {
    setNotice(null);
    setPreview(null);
    setForm({ ...form, [key]: value });
  };
  const draft = () => formToConfig(form, base);
  const errors = validateForm(form);
  const invalid = Object.keys(errors).length > 0;

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
        <Button
          onClick={() => save.mutate(draft())}
          disabled={save.isPending || invalid}
        >
          {save.isPending
            ? "Saving…"
            : status === "invalid"
              ? "Overwrite invalid rules file"
              : "Save rules"}
        </Button>
        <Button
          variant="outline"
          onClick={() => runPreview.mutate(draft())}
          disabled={runPreview.isPending || invalid}
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
        {dirty ? (
          <span className="self-center text-sm text-amber-300">
            Unsaved changes
          </span>
        ) : null}
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
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="break-words">
                    {item.title} · {item.employer}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
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
        <div className="max-w-xs">
          <NumberField
            id="pf-max-age"
            label="Max posting age (days)"
            hint="Drops jobs posted longer ago than this. Leave empty for no limit. Jobs without a posting date always pass."
            placeholder="No limit"
            value={form.maxPostingAgeDays}
            error={errors.maxPostingAgeDays}
            onChange={(v) => update("maxPostingAgeDays", v)}
          />
        </div>
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
        <ToggleField
          id="pf-us-only"
          label="Drop US-only jobs"
          hint="Drops jobs whose location is only in the US. If the posting mentions Canada, the AI check decides whether it can be done from Canada."
          checked={form.dropUsOnly}
          onChange={(v) => update("dropUsOnly", v)}
        />
        <TextField
          id="pf-company-notes"
          label="Company notes"
          hint="One per line, as Company: note. Things you know that the posting may not say, e.g. Float: hybrid, 3 days a week in the Toronto office. The AI check treats them as true for that company's jobs."
          value={form.companyNotes}
          error={errors.companyNotes}
          onChange={(v) => update("companyNotes", v)}
        />
      </Section>

      <Section title="Language">
        <ToggleField
          id="pf-language"
          label="Drop jobs that need another language"
          hint="Drops jobs that make a language on the list mandatory, e.g. 'Bilingual French/English required' or a title like 'Bilingual Product Manager'. A language that's only an asset or nice to have is flagged for the AI check instead. Scoring also fails these jobs as a backstop."
          checked={form.languageEnabled}
          onChange={(v) => update("languageEnabled", v)}
        />
        <ToggleField
          id="pf-language-posting"
          label="Drop postings written in another language"
          hint="Drops listings written mostly in French, Spanish, German or Portuguese. Bilingual postings with a full English version are kept and checked for a requirement."
          checked={form.dropNonEnglishPostings}
          onChange={(v) => update("dropNonEnglishPostings", v)}
        />
        <TextField
          id="pf-languages"
          label="Languages you don't speak"
          hint="One per line. Remove a language to allow jobs that need it."
          value={form.blockedLanguages}
          rows={5}
          onChange={(v) => update("blockedLanguages", v)}
        />
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
            error={errors.floorAnnualCad}
            onChange={(v) => update("floorAnnualCad", v)}
          />
          <NumberField
            id="pf-hours"
            label="Hours per year (hourly → annual)"
            value={form.hoursPerYear}
            error={errors.hoursPerYear}
            onChange={(v) => update("hoursPerYear", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="pf-currency">Default currency</Label>
            <Input
              id="pf-currency"
              value={form.defaultCurrency}
              onChange={(e) => update("defaultCurrency", e.target.value)}
            />
            <FieldError message={errors.defaultCurrency} />
          </div>
        </div>
        <TextField
          id="pf-rates"
          label="Rates to CAD"
          hint="One per line, e.g. USD=1.37"
          value={form.ratesToCad}
          error={errors.ratesToCad}
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
            error={errors.batchSize}
            onChange={(v) => update("batchSize", v)}
          />
          <NumberField
            id="pf-chars"
            label="Description characters"
            value={form.descriptionChars}
            error={errors.descriptionChars}
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

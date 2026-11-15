import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  formatPeriod,
  isPeriodReversed,
  MAX_PERIOD_YEAR,
  MIN_PERIOD_YEAR,
  MONTH_LABELS,
  type ParsedPeriod,
  parsePeriod,
} from "./period";

type PeriodFieldState = {
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
};

const EMPTY_STATE: PeriodFieldState = {
  startMonth: "",
  startYear: "",
  endMonth: "",
  endYear: "",
  current: false,
};

function stateFromValue(value: string): PeriodFieldState {
  const parsed = parsePeriod(value);
  if (!parsed) return EMPTY_STATE;
  const end = parsed.end === "present" ? null : parsed.end;
  return {
    startMonth: parsed.start.month ? String(parsed.start.month) : "",
    startYear: String(parsed.start.year),
    endMonth: end?.month ? String(end.month) : "",
    endYear: end ? String(end.year) : "",
    current: parsed.end === "present",
  };
}

function readYear(text: string): number | null {
  if (!/^\d{4}$/.test(text.trim())) return null;
  const year = Number(text);
  return year >= MIN_PERIOD_YEAR && year <= MAX_PERIOD_YEAR ? year : null;
}

function readMonth(text: string): number | null {
  const month = Number(text);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

/** Build the period from the inputs. Null when there's no valid start year. */
export function periodFromState(state: PeriodFieldState): ParsedPeriod | null {
  const startYear = readYear(state.startYear);
  if (startYear == null) return null;
  const start = { year: startYear, month: readMonth(state.startMonth) };
  if (state.current) return { start, end: "present" };
  const endYear = readYear(state.endYear);
  if (endYear == null) return { start, end: start };
  return { start, end: { year: endYear, month: readMonth(state.endMonth) } };
}

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function MonthYearInputs({
  idPrefix,
  label,
  month,
  year,
  disabled,
  onMonthChange,
  onYearChange,
}: {
  idPrefix: string;
  label: string;
  month: string;
  year: string;
  disabled?: boolean;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <select
          id={`${idPrefix}-month`}
          aria-label={`${label} month`}
          className={selectClassName}
          value={month}
          onChange={(event) => onMonthChange(event.currentTarget.value)}
        >
          <option value="">Month</option>
          {MONTH_LABELS.map((monthLabel, index) => (
            <option key={monthLabel} value={String(index + 1)}>
              {monthLabel}
            </option>
          ))}
        </select>
        <Input
          id={`${idPrefix}-year`}
          aria-label={`${label} year`}
          inputMode="numeric"
          maxLength={4}
          placeholder="Year"
          value={year}
          onChange={(event) =>
            onYearChange(event.currentTarget.value.replace(/\D/g, ""))
          }
          className="bg-background/60"
        />
      </div>
    </fieldset>
  );
}

export function PeriodField({
  id,
  label,
  presentLabel = "Ongoing",
  value,
  onChange,
}: {
  id: string;
  label: string;
  presentLabel?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const idPrefix = id || generatedId;
  const [customMode, setCustomMode] = useState(
    () => value.trim() !== "" && parsePeriod(value) == null,
  );
  const [state, setState] = useState<PeriodFieldState>(() =>
    stateFromValue(value),
  );
  const lastEmittedRef = useRef(value);

  // Re-sync when the value changes from outside (dialog reset, AI assist).
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const parsed = parsePeriod(value);
    if (value.trim() !== "" && parsed == null) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    setState(stateFromValue(value));
  }, [value]);

  const emit = (next: string) => {
    lastEmittedRef.current = next;
    onChange(next);
  };

  const update = (patch: Partial<PeriodFieldState>) => {
    const next = { ...state, ...patch };
    setState(next);
    const period = periodFromState(next);
    emit(period ? formatPeriod(period) : "");
  };

  const period = periodFromState(state);
  const reversed = period ? isPeriodReversed(period) : false;

  if (customMode) {
    return (
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-text`}>
          {label}
        </label>
        <Input
          id={`${idPrefix}-text`}
          value={value}
          placeholder="e.g. Summer 2019"
          onChange={(event) => emit(event.currentTarget.value)}
          className="bg-background/60"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Custom text isn't sorted by date.</span>
          <button
            type="button"
            className="font-medium text-info hover:underline"
            onClick={() => {
              const nextState = stateFromValue(value);
              setState(nextState);
              setCustomMode(false);
              const parsed = periodFromState(nextState);
              emit(parsed ? formatPeriod(parsed) : "");
            }}
          >
            Use date pickers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <MonthYearInputs
            idPrefix={`${idPrefix}-start`}
            label="Start"
            month={state.startMonth}
            year={state.startYear}
            onMonthChange={(startMonth) => update({ startMonth })}
            onYearChange={(startYear) => update({ startYear })}
          />
          {state.current ? (
            <div className="grid gap-1.5">
              <span className="mb-1.5 text-xs font-medium text-muted-foreground">
                End
              </span>
              <div className="flex h-9 items-center rounded-md border border-dashed border-border/70 px-3 text-sm text-muted-foreground">
                Present
              </div>
            </div>
          ) : (
            <MonthYearInputs
              idPrefix={`${idPrefix}-end`}
              label="End"
              month={state.endMonth}
              year={state.endYear}
              onMonthChange={(endMonth) => update({ endMonth })}
              onYearChange={(endYear) => update({ endYear })}
            />
          )}
        </div>
        <label
          htmlFor={`${idPrefix}-current`}
          className="flex cursor-pointer items-center justify-between gap-3 text-sm"
        >
          <span>{presentLabel}</span>
          <Switch
            id={`${idPrefix}-current`}
            checked={state.current}
            onCheckedChange={(current) => update({ current })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span
          className={cn(reversed && "text-warning")}
          data-testid="period-preview"
        >
          {reversed
            ? "End date is before the start date."
            : period
              ? `Shows as: ${formatPeriod(period)}`
              : "Add a start year to set the period."}
        </span>
        <button
          type="button"
          className="font-medium text-info hover:underline"
          onClick={() => setCustomMode(true)}
        >
          Type it instead
        </button>
      </div>
    </div>
  );
}

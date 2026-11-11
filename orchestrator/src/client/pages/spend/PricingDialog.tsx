/** Edit the per-model price list used for spend estimates (fork: spend). */
import * as api from "@client/api";
import type { SpendModelPrice, SpendPricing } from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type PriceField = keyof SpendModelPrice;

const FIELDS: Array<{ key: PriceField; label: string }> = [
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "cacheWrite", label: "Cache write" },
  { key: "cacheRead", label: "Cache read" },
];

type Draft = Record<string, Record<PriceField, string>>;

function toDraft(models: Record<string, SpendModelPrice>): Draft {
  const draft: Draft = {};
  for (const [model, price] of Object.entries(models)) {
    draft[model] = {
      input: String(price.input),
      output: String(price.output),
      cacheWrite: String(price.cacheWrite),
      cacheRead: String(price.cacheRead),
    };
  }
  return draft;
}

function parseDraft(
  draft: Draft,
):
  | { ok: true; models: Record<string, SpendModelPrice> }
  | { ok: false; error: string } {
  const models: Record<string, SpendModelPrice> = {};
  for (const [model, fields] of Object.entries(draft)) {
    const id = model.trim();
    if (!id) continue;
    const price = {} as SpendModelPrice;
    for (const { key, label } of FIELDS) {
      const value = Number(fields[key]);
      if (!Number.isFinite(value) || value < 0) {
        return {
          ok: false,
          error: `${label} price for ${id} must be a number of 0 or more`,
        };
      }
      price[key] = value;
    }
    models[id] = price;
  }
  return { ok: true, models };
}

export function PricingDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<SpendPricing>({
    queryKey: queryKeys.spend.pricing(),
    queryFn: api.getSpendPricing,
    enabled: props.open,
  });
  const [draft, setDraft] = useState<Draft>({});
  const [newModel, setNewModel] = useState("");

  useEffect(() => {
    if (data && props.open) {
      const models = { ...data.models };
      // Offer a row for every model seen in usage, priced or not.
      for (const model of data.seenModels) {
        if (!models[model]) {
          models[model] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
        }
      }
      setDraft(toDraft(models));
    }
  }, [data, props.open]);

  const order = useMemo(() => {
    const seen = new Set(data?.seenModels ?? []);
    return Object.keys(draft).sort((a, b) => {
      const sa = seen.has(a) ? 0 : 1;
      const sb = seen.has(b) ? 0 : 1;
      return sa - sb || a.localeCompare(b);
    });
  }, [draft, data]);

  const save = useMutation({
    mutationFn: (models: Record<string, SpendModelPrice>) =>
      api.saveSpendPricing(models),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.spend.pricing(), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.spend.all });
      toast.success("Prices saved");
      props.onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save");
    },
  });

  const handleSave = () => {
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    // An untouched all-zero row for an unpriced model means "no price yet",
    // not "free"; leave it out so the page keeps flagging it.
    const models = Object.fromEntries(
      Object.entries(parsed.models).filter(
        ([model, price]) =>
          data?.models[model] ||
          Object.values(price).some((value) => value > 0),
      ),
    );
    save.mutate(models);
  };

  const addModel = () => {
    const id = newModel.trim();
    if (!id || draft[id]) return;
    setDraft((current) => ({
      ...current,
      [id]: { input: "0", output: "0", cacheWrite: "0", cacheRead: "0" },
    }));
    setNewModel("");
  };

  const seen = new Set(data?.seenModels ?? []);
  const customized = new Set(data?.customized ?? []);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Model prices</DialogTitle>
          <DialogDescription>
            US dollars per million tokens. Changes re-price all recorded usage.
            Defaults are Anthropic&apos;s list prices.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prices...
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
              <span>Model</span>
              {FIELDS.map((f) => (
                <span key={f.key}>{f.label}</span>
              ))}
              <span />
            </div>
            {order.map((model) => {
              const fields = draft[model];
              const def = data?.defaults[model];
              return (
                <div
                  key={model}
                  className="grid grid-cols-2 items-center gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_32px] sm:border-0 sm:p-1"
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <div className="truncate font-mono text-xs">{model}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {seen.has(model) ? "Used by this app" : ""}
                      {customized.has(model) ? " · edited" : ""}
                    </div>
                  </div>
                  {FIELDS.map((f) => (
                    <Input
                      key={f.key}
                      aria-label={`${f.label} price for ${model}`}
                      inputMode="decimal"
                      value={fields[f.key]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [model]: {
                            ...current[model],
                            [f.key]: event.target.value,
                          },
                        }))
                      }
                      className="h-8 text-sm tabular-nums"
                    />
                  ))}
                  {def && customized.has(model) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Reset to default"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          ...toDraft({ [model]: def }),
                        }))
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 pt-2">
              <Input
                placeholder="Add a model id, e.g. gpt-5-mini"
                value={newModel}
                onChange={(event) => setNewModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addModel();
                }}
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addModel}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending || isLoading}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Save prices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

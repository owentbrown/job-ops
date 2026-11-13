import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import { type ValuesEntry, ValuesEntrySchema } from "@shared/types";
import { Star, X } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EntriesGate, FieldError, PanelFooter, PanelSheet } from "./panelParts";
import { type FieldErrors, validate } from "./validation";

export const IDEAL_SLIDERS = [
  { key: "size", left: "Startup", right: "Enterprise" },
  { key: "management", left: "Hands-on", right: "Managing" },
  { key: "office", left: "Remote", right: "In office" },
] as const;

const EMPTY: ValuesEntry = {
  items: [],
  ideal: { size: 50, management: 50, office: 50 },
};

const ValuesForm: React.FC<{ initial: ValuesEntry; onDone: () => void }> = ({
  initial,
  onDone,
}) => {
  const id = useId();
  const { saveEntry } = useProfileMutations();
  const [items, setItems] = useState(initial.items);
  const [ideal, setIdeal] = useState(initial.ideal);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    if (!items.some((i) => i.label.toLowerCase() === label.toLowerCase())) {
      setItems((prev) => [...prev, { label, starred: false }]);
    }
    setDraft("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(ValuesEntrySchema, { items, ideal });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await saveEntry.mutateAsync({ kind: "values", data: result.data });
      toast.success("Values saved");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't save your values");
    }
  };

  const itemsError =
    errors.items ??
    Object.entries(errors).find(([k]) => k.startsWith("items."))?.[1];

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${id}-value`}>What matters to you</Label>
        {items.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Values">
            {items.map((item) => (
              <li
                key={item.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-(--radius-pill) border py-0.5 pr-1 pl-1 text-sm",
                  item.starred &&
                    "border-transparent bg-primary text-primary-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={item.starred}
                  onClick={() =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.label === item.label
                          ? { ...i, starred: !i.starred }
                          : i,
                      ),
                    )
                  }
                  className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Star
                    aria-hidden
                    className={cn("size-3.5", item.starred && "fill-current")}
                  />
                  <span className="sr-only">Star {item.label}</span>
                </button>
                {item.label}
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) =>
                      prev.filter((i) => i.label !== item.label),
                    )
                  }
                  className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X aria-hidden className="size-3.5" />
                  <span className="sr-only">Remove {item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={`${id}-value`}
            value={draft}
            maxLength={80}
            placeholder="e.g. Ownership"
            aria-invalid={itemsError ? true : undefined}
            aria-describedby={itemsError ? `${id}-items-error` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add}>
            Add<span className="sr-only"> value</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Star the ones that matter most.
        </p>
        <FieldError id={`${id}-items-error`} message={itemsError} />
      </div>
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Ideal role</legend>
        {IDEAL_SLIDERS.map(({ key, left, right }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`${id}-${key}`} className="sr-only">
              {left} to {right}
            </Label>
            <div
              aria-hidden
              className="flex justify-between text-xs text-muted-foreground"
            >
              <span>{left}</span>
              <span>{right}</span>
            </div>
            <input
              id={`${id}-${key}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={ideal[key]}
              aria-valuetext={`${ideal[key]} of 100, toward ${ideal[key] < 50 ? left : ideal[key] > 50 ? right : "neither"}`}
              onChange={(e) =>
                setIdeal((prev) => ({
                  ...prev,
                  [key]: Number(e.target.value),
                }))
              }
              className="w-full accent-primary"
            />
          </div>
        ))}
      </fieldset>
      <PanelFooter saving={saveEntry.isPending} onCancel={onDone} />
    </form>
  );
};

export const ValuesSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const entries = useProfileEntries();
  return (
    <PanelSheet
      open={open}
      onOpenChange={onOpenChange}
      title="What drives you"
      description="Name what matters to you in a role, then set where you'd like to land."
    >
      <EntriesGate query={entries}>
        {(data) => (
          <ValuesForm
            initial={data.values ?? EMPTY}
            onDone={() => onOpenChange(false)}
          />
        )}
      </EntriesGate>
    </PanelSheet>
  );
};

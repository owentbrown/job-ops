import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import {
  type PitchEntry,
  PitchEntrySchema,
  type ProfileEntriesResponse,
} from "@shared/types";
import type React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EntriesGate,
  FieldError,
  PanelFooter,
  PanelSheet,
  ToggleChip,
} from "./panelParts";
import { type FieldErrors, validate, wordCount } from "./validation";

/** Spoken at roughly 150 words a minute. */
export const PITCH_LENGTHS = [
  { key: "s15", label: "15-second pitch", target: 40 },
  { key: "s30", label: "30-second pitch", target: 75 },
  { key: "s60", label: "60-second pitch", target: 150 },
] as const;

type PitchKey = (typeof PITCH_LENGTHS)[number]["key"];

export function wordHint(text: string, target: number): string {
  const words = wordCount(text);
  const base = `${words} word${words === 1 ? "" : "s"} · aim for about ${target}`;
  if (words > target * 1.3) return `${base}. A little long; try trimming.`;
  return base;
}

const EMPTY: PitchEntry = {
  s15: "",
  s30: "",
  s60: "",
  builtFrom: { storyIds: [], values: [] },
};

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((i) => i !== item) : [...list, item];

const PitchForm: React.FC<{
  entries: ProfileEntriesResponse;
  onDone: () => void;
}> = ({ entries, onDone }) => {
  const id = useId();
  const { saveEntry } = useProfileMutations();
  const initial = entries.pitch ?? EMPTY;
  const [text, setText] = useState<Record<PitchKey, string>>({
    s15: initial.s15,
    s30: initial.s30,
    s60: initial.s60,
  });
  const [storyIds, setStoryIds] = useState(initial.builtFrom.storyIds);
  const [values, setValues] = useState(initial.builtFrom.values);
  const [errors, setErrors] = useState<FieldErrors>({});

  const valueOptions = [
    ...(entries.values?.items.map((v) => v.label) ?? []),
    ...initial.builtFrom.values,
  ].filter((v, i, all) => all.indexOf(v) === i);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(PitchEntrySchema, {
      s15: text.s15.trim(),
      s30: text.s30.trim(),
      s60: text.s60.trim(),
      // Drop links to stories that were deleted since.
      builtFrom: {
        storyIds: storyIds.filter((sid) =>
          entries.stories.some((s) => s.id === sid),
        ),
        values,
      },
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await saveEntry.mutateAsync({ kind: "pitch", data: result.data });
      toast.success("Pitch saved");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't save your pitch");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {PITCH_LENGTHS.map(({ key, label, target }) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`${id}-${key}`}>{label}</Label>
          <Textarea
            id={`${id}-${key}`}
            value={text[key]}
            rows={key === "s60" ? 7 : key === "s30" ? 5 : 3}
            aria-invalid={errors[key] ? true : undefined}
            aria-describedby={`${id}-${key}-hint${errors[key] ? ` ${id}-${key}-error` : ""}`}
            onChange={(e) =>
              setText((prev) => ({ ...prev, [key]: e.target.value }))
            }
          />
          <p id={`${id}-${key}-hint`} className="text-xs text-muted-foreground">
            {wordHint(text[key], target)}
          </p>
          <FieldError id={`${id}-${key}-error`} message={errors[key]} />
        </div>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Built from stories</legend>
        {entries.stories.length ? (
          <div className="flex flex-wrap gap-2">
            {entries.stories.map((story) => (
              <ToggleChip
                key={story.id}
                pressed={storyIds.includes(story.id)}
                onToggle={() => setStoryIds((prev) => toggle(prev, story.id))}
              >
                {story.data.title}
              </ToggleChip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No stories yet. Add some in the story bank to link them here.
          </p>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Built from values</legend>
        {valueOptions.length ? (
          <div className="flex flex-wrap gap-2">
            {valueOptions.map((value) => (
              <ToggleChip
                key={value}
                pressed={values.includes(value)}
                onToggle={() => setValues((prev) => toggle(prev, value))}
              >
                {value}
              </ToggleChip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No values yet. Add them under What drives you.
          </p>
        )}
      </fieldset>
      <PanelFooter saving={saveEntry.isPending} onCancel={onDone} />
    </form>
  );
};

export const PitchSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const entries = useProfileEntries();
  return (
    <PanelSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit your pitch"
      description="Three lengths of the same story: who you are, what you've done, what you want next."
    >
      <EntriesGate query={entries}>
        {(data) => (
          <PitchForm entries={data} onDone={() => onOpenChange(false)} />
        )}
      </EntriesGate>
    </PanelSheet>
  );
};

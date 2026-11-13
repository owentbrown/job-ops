import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import {
  PROFILE_THEMES,
  type StoryEntry,
  StoryEntrySchema,
  type Theme,
} from "@shared/types";
import { Trash2 } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EntriesGate,
  FieldError,
  PanelFooter,
  PanelSheet,
  ToggleChip,
} from "./panelParts";
import { THEME_LABELS } from "./parts";
import { type FieldErrors, validate } from "./validation";

const EMPTY: StoryEntry = {
  title: "",
  themes: [],
  situation: "",
  task: "",
  action: "",
  result: "",
  metric: null,
  source: "manual",
};

const STAR = [
  {
    key: "situation",
    label: "Situation",
    hint: "Where were you, what was at stake?",
  },
  { key: "task", label: "Task", hint: "What did you have to do?" },
  {
    key: "action",
    label: "Action",
    hint: "What did you do, in your own words?",
  },
  { key: "result", label: "Result", hint: "What changed? Numbers help." },
] as const;

type StarKey = (typeof STAR)[number]["key"];

const StoryForm: React.FC<{
  storyId: string | null;
  initial: StoryEntry;
  onDone: () => void;
}> = ({ storyId, initial, onDone }) => {
  const id = useId();
  const { createStory, updateStory, deleteStory } = useProfileMutations();
  const [title, setTitle] = useState(initial.title);
  const [themes, setThemes] = useState<Theme[]>(initial.themes);
  const [star, setStar] = useState<Record<StarKey, string>>({
    situation: initial.situation,
    task: initial.task,
    action: initial.action,
    result: initial.result,
  });
  const [metric, setMetric] = useState(initial.metric ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saving = createStory.isPending || updateStory.isPending;

  const toggleTheme = (theme: Theme) =>
    setThemes((prev) =>
      prev.includes(theme)
        ? prev.filter((t) => t !== theme)
        : PROFILE_THEMES.filter((t) => t === theme || prev.includes(t)),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(StoryEntrySchema, {
      title: title.trim(),
      themes,
      situation: star.situation.trim(),
      task: star.task.trim(),
      action: star.action.trim(),
      result: star.result.trim(),
      metric: metric.trim() || null,
      source: "manual",
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      if (storyId) {
        await updateStory.mutateAsync({ id: storyId, data: result.data });
      } else {
        await createStory.mutateAsync(result.data);
      }
      toast.success(storyId ? "Story saved" : "Story added");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't save your story");
    }
  };

  const remove = async () => {
    if (!storyId) return;
    try {
      await deleteStory.mutateAsync(storyId);
      setConfirmOpen(false);
      toast.success("Story deleted");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't delete the story");
    }
  };

  const field = (key: string) => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined,
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          value={title}
          placeholder="Cut call volume by 100K a year"
          onChange={(e) => setTitle(e.target.value)}
          {...field("title")}
        />
        <FieldError id={`${id}-title-error`} message={errors.title} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Themes</legend>
        <div className="flex flex-wrap gap-2">
          {PROFILE_THEMES.map((theme) => (
            <ToggleChip
              key={theme}
              pressed={themes.includes(theme)}
              onToggle={() => toggleTheme(theme)}
            >
              {THEME_LABELS[theme]}
            </ToggleChip>
          ))}
        </div>
      </fieldset>
      {STAR.map(({ key, label, hint }) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`${id}-${key}`}>{label}</Label>
          <Textarea
            id={`${id}-${key}`}
            value={star[key]}
            rows={3}
            placeholder={hint}
            onChange={(e) =>
              setStar((prev) => ({ ...prev, [key]: e.target.value }))
            }
            {...field(key)}
          />
          <FieldError id={`${id}-${key}-error`} message={errors[key]} />
        </div>
      ))}
      <div className="space-y-2">
        <Label htmlFor={`${id}-metric`}>Result metric</Label>
        <Input
          id={`${id}-metric`}
          value={metric}
          placeholder="e.g. 100K fewer calls a year"
          onChange={(e) => setMetric(e.target.value)}
          {...field("metric")}
        />
        <FieldError id={`${id}-metric-error`} message={errors.metric} />
      </div>
      <PanelFooter saving={saving} onCancel={onDone}>
        {storyId ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 aria-hidden />
            Delete story
          </Button>
        ) : null}
      </PanelFooter>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              “{initial.title}” will be removed from your story bank and from
              any pitch it was linked to. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteStory.isPending}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
};

export const StorySheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this story; omit to add a new one. */
  storyId?: string | null;
}> = ({ open, onOpenChange, storyId = null }) => {
  const entries = useProfileEntries();
  return (
    <PanelSheet
      open={open}
      onOpenChange={onOpenChange}
      title={storyId ? "Edit story" : "Add a story"}
      description="A short result you can tell in an interview: situation, task, action, result."
    >
      <EntriesGate query={entries}>
        {(data) => {
          if (!storyId) {
            return (
              <StoryForm
                storyId={null}
                initial={EMPTY}
                onDone={() => onOpenChange(false)}
              />
            );
          }
          const row = data.stories.find((s) => s.id === storyId);
          return row ? (
            <StoryForm
              storyId={storyId}
              initial={row.data}
              onDone={() => onOpenChange(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This story no longer exists.
            </p>
          );
        }}
      </EntriesGate>
    </PanelSheet>
  );
};

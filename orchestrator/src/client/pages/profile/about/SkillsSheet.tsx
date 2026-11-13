import { ApiClientError } from "@client/api/core";
import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import { starterSkillItems as sharedStarterSkillItems } from "@shared/profile/starter-skills";
import {
  type SkillItem,
  type SkillsEntry,
  SkillsEntrySchema,
} from "@shared/types";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { formatUserFacingError } from "@/client/lib/error-format";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ChipListEditor,
  EntriesGate,
  FieldError,
  PanelFooter,
  PanelSheet,
} from "./panelParts";
import { type FieldErrors, validate } from "./validation";

/**
 * The list the server uses when nothing is saved: the starter groups. Prefix
 * keywords keep their trailing "*" ("prioriti*"), so saving the list keeps
 * them matching word starts.
 */
export function starterSkillItems(): SkillItem[] {
  return sharedStarterSkillItems();
}

/** Friendly copy for the refresh route's failure codes. */
export function refreshErrorMessage(error: unknown): string {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 409) {
    return "A refresh is already running. Give it a minute, then reopen this panel.";
  }
  if (status === 502) {
    return "The AI didn't respond. Your skills are unchanged; try again in a moment.";
  }
  if (status === 400) {
    return "Run a job search first, so there are job descriptions to learn from.";
  }
  return formatUserFacingError(error, "Skill refresh failed.");
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "skill";

const SkillRow: React.FC<{
  item: SkillItem;
  index: number;
  errors: FieldErrors;
  onChange: (next: SkillItem) => void;
}> = ({ item, index, errors, onChange }) => {
  const id = useId();
  // Renamed or re-keyworded skills become the user's, so an AI refresh keeps them.
  const edit = (patch: Partial<SkillItem>) =>
    onChange({ ...item, ...patch, source: "user" });
  const labelError = errors[`items.${index}.label`];
  const keywordError =
    errors[`items.${index}.keywords`] ??
    Object.entries(errors).find(([k]) =>
      k.startsWith(`items.${index}.keywords.`),
    )?.[1];
  return (
    <li>
      <details
        className="group rounded-(--radius) border"
        open={labelError || keywordError ? true : undefined}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <span className={item.hidden ? "text-muted-foreground" : ""}>
            {item.label || "Untitled skill"}
          </span>
          <span className="text-xs text-muted-foreground">
            {item.hidden
              ? "Hidden"
              : `${item.keywords.length} keyword${item.keywords.length === 1 ? "" : "s"}`}
            {item.source === "ai" ? " · AI" : ""}
          </span>
        </summary>
        <div className="space-y-4 border-t p-3">
          <div className="space-y-2">
            <Label htmlFor={`${id}-label`}>Name</Label>
            <Input
              id={`${id}-label`}
              value={item.label}
              aria-invalid={labelError ? true : undefined}
              aria-describedby={labelError ? `${id}-label-error` : undefined}
              onChange={(e) => edit({ label: e.target.value })}
            />
            <FieldError id={`${id}-label-error`} message={labelError} />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id={`${id}-shown`}
              checked={!item.hidden}
              onCheckedChange={(shown) => onChange({ ...item, hidden: !shown })}
            />
            <Label htmlFor={`${id}-shown`}>Show on skill map</Label>
          </div>
          <ChipListEditor
            label={`Keywords for ${item.label || "this skill"}`}
            items={item.keywords}
            onChange={(keywords) => edit({ keywords })}
            placeholder="A word jobs use, e.g. roadmap"
            hint="End with * to match word starts, e.g. prioriti*"
            maxLength={80}
            error={keywordError}
          />
        </div>
      </details>
    </li>
  );
};

const SkillsForm: React.FC<{
  initial: SkillsEntry;
  onDone: () => void;
}> = ({ initial, onDone }) => {
  const id = useId();
  const { saveEntry, refreshSkills } = useProfileMutations();
  const [items, setItems] = useState(initial.items);
  const [refreshedAt, setRefreshedAt] = useState(initial.refreshedAt);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const update = (next: SkillItem[]) => {
    setItems(next);
    setDirty(true);
  };

  const addSkill = () => {
    const label = draft.trim();
    if (!label) return;
    const ids = new Set(items.map((i) => i.id));
    const base = `user-${slug(label)}`;
    let newId = base;
    for (let n = 2; ids.has(newId); n++) newId = `${base}-${n}`;
    update([
      ...items,
      { id: newId, label, keywords: [label], hidden: false, source: "user" },
    ]);
    setDraft("");
  };

  const refresh = async () => {
    setRefreshError(null);
    try {
      const result = await refreshSkills.mutateAsync();
      setItems(result.skills.items);
      setRefreshedAt(result.skills.refreshedAt);
      setDirty(false);
      toast.success(
        `Skills refreshed from ${result.jobsUsed} jobs: ${result.added} new, ${result.updated} updated`,
      );
    } catch (error) {
      setRefreshError(refreshErrorMessage(error));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(SkillsEntrySchema, {
      items: items.map((i) => ({ ...i, label: i.label.trim() })),
      refreshedAt,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await saveEntry.mutateAsync({ kind: "skills", data: result.data });
      toast.success("Skills saved");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't save your skills");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <section
        aria-label="Refresh with AI"
        className="space-y-2 rounded-(--radius) border border-dashed p-3"
      >
        <p className="text-sm">
          Read your best-fit job descriptions and update the list to what those
          jobs ask for. Skills you renamed or hid are kept.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshSkills.isPending || dirty}
          >
            <Sparkles aria-hidden />
            {refreshSkills.isPending ? "Refreshing…" : "Refresh with AI"}
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {refreshSkills.isPending
              ? "Reading job descriptions. This can take up to a minute."
              : dirty
                ? "Save your changes before refreshing."
                : refreshedAt
                  ? `Last refreshed ${formatWhen(refreshedAt)}`
                  : "Not refreshed yet"}
          </span>
        </div>
        {refreshError ? (
          <p role="alert" className="text-sm text-destructive">
            {refreshError}
          </p>
        ) : null}
      </section>
      <ul className="space-y-2" aria-label="Skills">
        {items.map((item, index) => (
          <SkillRow
            key={item.id}
            item={item}
            index={index}
            errors={errors}
            onChange={(next) =>
              update(items.map((i) => (i.id === item.id ? next : i)))
            }
          />
        ))}
      </ul>
      <div className="space-y-2">
        <Label htmlFor={`${id}-new`}>Add a skill</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-new`}
            value={draft}
            maxLength={120}
            placeholder="e.g. Vendor management"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addSkill}>
            Add<span className="sr-only"> skill</span>
          </Button>
        </div>
        <FieldError id={`${id}-items-error`} message={errors.items} />
      </div>
      <PanelFooter saving={saveEntry.isPending} onCancel={onDone} />
    </form>
  );
};

export const SkillsSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const entries = useProfileEntries();
  return (
    <PanelSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit skills"
      description="Rename, hide or add skills, and the words jobs use for them."
    >
      <EntriesGate query={entries}>
        {(data) => (
          <SkillsForm
            initial={
              data.skills ?? { items: starterSkillItems(), refreshedAt: null }
            }
            onDone={() => onOpenChange(false)}
          />
        )}
      </EntriesGate>
    </PanelSheet>
  );
};

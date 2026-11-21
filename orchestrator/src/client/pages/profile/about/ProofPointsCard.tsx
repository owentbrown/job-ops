import * as api from "@client/api";
import {
  invalidateProfileData,
  useProfileEntries,
} from "@client/hooks/useProfileInsights";
import { showErrorToast } from "@client/lib/error-toast";
import type { ProfileEntryRow, ProofPointEntry } from "@shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CardHeading, EmptyState, labelClass } from "./parts";

const PLACEHOLDER =
  "e.g. Governance experience partnering with legal, risk and compliance: risk assessments, privacy impact assessments, compliance reviews of new opportunities.";

/** Keywords are edited as one comma-separated line. */
function keywordsToText(keywords: string[]): string {
  return keywords.join(", ");
}

function textToKeywords(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((k) => k.trim())
    .filter((k) => {
      const key = k.toLowerCase();
      if (!k || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

type Draft = { key: string; point: ProofPointEntry; keywordsText: string };

let draftCounter = 0;
const toDraft = (point: ProofPointEntry): Draft => ({
  key: `draft-${++draftCounter}`,
  point,
  keywordsText: keywordsToText(point.keywords),
});

const fromDraft = (draft: Draft): ProofPointEntry => ({
  ...draft.point,
  title: draft.point.title.trim(),
  text: draft.point.text.trim(),
  role: draft.point.role?.trim() || null,
  metric: draft.point.metric?.trim() || null,
  keywords: textToKeywords(draft.keywordsText),
});

const isSavable = (draft: Draft) =>
  Boolean(draft.point.title.trim() && draft.point.text.trim());

/** Editable preview of one proof point (a new draft or a saved one). */
const ProofPointEditor: React.FC<{
  draft: Draft;
  roles: string[];
  saving: boolean;
  saveLabel: string;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ draft, roles, saving, saveLabel, onChange, onSave, onCancel }) => {
  const id = useId();
  const { point } = draft;
  const set = (patch: Partial<ProofPointEntry>) =>
    onChange({ ...draft, point: { ...point, ...patch } });

  return (
    <div className="space-y-3 rounded-(--radius) border bg-background p-3">
      <div className="space-y-1">
        <label htmlFor={`${id}-title`} className={labelClass}>
          Title
        </label>
        <Input
          id={`${id}-title`}
          value={point.title}
          maxLength={200}
          onChange={(e) => set({ title: e.currentTarget.value })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-text`} className={labelClass}>
          What you did
        </label>
        <Textarea
          id={`${id}-text`}
          value={point.text}
          maxLength={2000}
          rows={3}
          onChange={(e) => set({ text: e.currentTarget.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-role`} className={labelClass}>
            Role
          </label>
          <Input
            id={`${id}-role`}
            value={point.role ?? ""}
            list={`${id}-roles`}
            maxLength={200}
            placeholder="Optional"
            onChange={(e) => set({ role: e.currentTarget.value })}
          />
          <datalist id={`${id}-roles`}>
            {roles.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-metric`} className={labelClass}>
            Number
          </label>
          <Input
            id={`${id}-metric`}
            value={point.metric ?? ""}
            maxLength={200}
            placeholder="Optional, e.g. 40+ reviews a year"
            onChange={(e) => set({ metric: e.currentTarget.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <span className={labelClass}>Skills it proves</span>
        {point.skills.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Skills it proves">
            {point.skills.map((skill) => (
              <li
                key={skill.label}
                className="inline-flex items-center gap-1 rounded-(--radius-pill) border bg-(--tile-tint-1) py-0.5 pr-1 pl-2.5 text-sm"
              >
                {skill.label}
                <button
                  type="button"
                  aria-label={`Remove ${skill.label}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() =>
                    set({
                      skills: point.skills.filter(
                        (s) => s.label !== skill.label,
                      ),
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None</p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-keywords`} className={labelClass}>
          Job-posting keywords
        </label>
        <Input
          id={`${id}-keywords`}
          value={draft.keywordsText}
          onChange={(e) =>
            onChange({ ...draft, keywordsText: e.currentTarget.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. Jobs that mention these get this proof point.
        </p>
      </div>
      {point.followUps.length ? (
        <div className="space-y-1 rounded-(--radius) bg-muted/40 p-2.5">
          <span className={labelClass}>Make it stronger</span>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {point.followUps.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Add answers to "What you did" or "Number" above.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !isSavable(draft)}
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {saveLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {saveLabel === "Save" ? "Discard" : "Cancel"}
        </Button>
      </div>
    </div>
  );
};

const SavedProofPoint: React.FC<{
  row: ProfileEntryRow<ProofPointEntry>;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}> = ({ row, onEdit, onDelete, deleting }) => {
  const [confirming, setConfirming] = useState(false);
  const p = row.data;
  return (
    <li className="space-y-1.5 rounded-(--radius) border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{p.title}</p>
          {p.role || p.metric ? (
            <p className="text-sm text-muted-foreground">
              {[p.role, p.metric].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {confirming ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={onDelete}
                disabled={deleting}
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit ${p.title}`}
                onClick={onEdit}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${p.title}`}
                onClick={() => setConfirming(true)}
              >
                <Trash2 aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>
      {p.skills.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
          {p.skills.map((s) => (
            <li
              key={s.label}
              className="rounded-(--radius-pill) bg-(--tile-tint-1) px-2.5 py-0.5 text-xs"
            >
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const ProofPointsCard: React.FC = () => {
  const queryClient = useQueryClient();
  const entries = useProfileEntries();
  const saved = entries.data?.proofPoints ?? [];
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(
    null,
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const textId = useId();

  const refresh = () => invalidateProfileData(queryClient);

  const draftMutation = useMutation({
    mutationFn: (input: string) => api.draftProofPoints(input),
    onSuccess: (result) => {
      setDrafts((current) => [...current, ...result.drafts.map(toDraft)]);
      setRoles(result.roles);
      setText("");
    },
    onError: (error) => showErrorToast(error, "Couldn't draft proof points"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProofPoint(id),
    onSuccess: refresh,
    onError: (error) => showErrorToast(error, "Couldn't delete"),
  });

  const saveDraft = async (draft: Draft) => {
    setSavingKey(draft.key);
    try {
      await api.createProofPoint(fromDraft(draft));
      setDrafts((current) => current.filter((d) => d.key !== draft.key));
      await refresh();
      toast.success("Proof point saved");
    } catch (error) {
      showErrorToast(error, "Couldn't save the proof point");
    } finally {
      setSavingKey(null);
    }
  };

  const saveAll = async () => {
    for (const draft of drafts.filter(isSavable)) {
      await saveDraft(draft);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingKey(editing.draft.key);
    try {
      await api.updateProofPoint(editing.id, fromDraft(editing.draft));
      setEditing(null);
      await refresh();
      toast.success("Proof point updated");
    } catch (error) {
      showErrorToast(error, "Couldn't update the proof point");
    } finally {
      setSavingKey(null);
    }
  };

  const drafting = draftMutation.isPending;

  return (
    <Card aria-labelledby="about-proof-points">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading
          id="about-proof-points"
          title="Proof points"
          subtitle={
            saved.length
              ? `${saved.length} saved · used in job scoring, cover letters and Ghostwriter`
              : "Type what you did in your own words. It's used in job scoring, cover letters and Ghostwriter."
          }
        />
        <div className="space-y-2">
          <label htmlFor={textId} className="sr-only">
            Add a proof point
          </label>
          <Textarea
            id={textId}
            value={text}
            rows={3}
            maxLength={6000}
            placeholder={PLACEHOLDER}
            disabled={drafting}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                text.trim() &&
                !drafting
              ) {
                draftMutation.mutate(text.trim());
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => draftMutation.mutate(text.trim())}
              disabled={!text.trim() || drafting}
            >
              {drafting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              {drafting ? "Drafting…" : "Turn into proof points"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Several bullets at once? One per line. You'll check each one
              before it's saved.
            </span>
          </div>
        </div>

        {drafts.length ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={cn(labelClass, "text-muted-foreground")}>
                {drafts.length === 1
                  ? "Check and save"
                  : `${drafts.length} drafts to check`}
              </h3>
              {drafts.length > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void saveAll()}
                  disabled={savingKey !== null}
                >
                  Save all
                </Button>
              ) : null}
            </div>
            {drafts.map((draft) => (
              <ProofPointEditor
                key={draft.key}
                draft={draft}
                roles={roles}
                saving={savingKey === draft.key}
                saveLabel="Save"
                onChange={(next) =>
                  setDrafts((current) =>
                    current.map((d) => (d.key === draft.key ? next : d)),
                  )
                }
                onSave={() => void saveDraft(draft)}
                onCancel={() =>
                  setDrafts((current) =>
                    current.filter((d) => d.key !== draft.key),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        {saved.length ? (
          <ul className="space-y-2" aria-label="Saved proof points">
            {[...saved].reverse().map((row) =>
              editing?.id === row.id ? (
                <li key={row.id}>
                  <ProofPointEditor
                    draft={editing.draft}
                    roles={roles}
                    saving={savingKey === editing.draft.key}
                    saveLabel="Save changes"
                    onChange={(next) => setEditing({ id: row.id, draft: next })}
                    onSave={() => void saveEdit()}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <SavedProofPoint
                  key={row.id}
                  row={row}
                  deleting={deleteMutation.isPending}
                  onEdit={() =>
                    setEditing({
                      id: row.id,
                      draft: toDraft({ ...row.data, source: "manual" }),
                    })
                  }
                  onDelete={() => deleteMutation.mutate(row.id)}
                />
              ),
            )}
          </ul>
        ) : drafts.length === 0 ? (
          <EmptyState>
            Each proof point adds its skills to your skill map, and the ones
            that match a job are used when it's scored and when its cover
            letter is written.
          </EmptyState>
        ) : null}
      </CardContent>
    </Card>
  );
};

import {
  useProfileEntries,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import { type BrandEntry, BrandEntrySchema } from "@shared/types";
import type React from "react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiAssist } from "./AiAssist";
import {
  ChipListEditor,
  EntriesGate,
  FieldError,
  PanelFooter,
  PanelSheet,
} from "./panelParts";
import { type FieldErrors, validate } from "./validation";

/** Where search terms live: the Find jobs (automatic run) panel on Jobs. */
export const SEARCH_TERMS_HREF = "/jobs/ready";

const BrandForm: React.FC<{
  initial: BrandEntry;
  targetRoles: string[];
  onDone: () => void;
}> = ({ initial, targetRoles, onDone }) => {
  const id = useId();
  const { saveEntry } = useProfileMutations();
  const [line, setLine] = useState(initial.line);
  const [industries, setIndustries] = useState(initial.industries);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(BrandEntrySchema, {
      line: line.trim(),
      industries,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await saveEntry.mutateAsync({ kind: "brand", data: result.data });
      toast.success("Brand saved");
      onDone();
    } catch (error) {
      showErrorToast(error, "Couldn't save your brand");
    }
  };

  const industryError =
    errors.industries ??
    Object.entries(errors).find(([k]) => k.startsWith("industries."))?.[1];

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <AiAssist
        target="brand"
        hasContent={line.trim() !== ""}
        current={() => ({ line, industries })}
        onDraft={(draft) => setLine(draft.line)}
      />
      <div className="space-y-2">
        <Label htmlFor={`${id}-line`}>Brand line</Label>
        <Textarea
          id={`${id}-line`}
          value={line}
          rows={3}
          placeholder="Strategy and operations leader who turns ambiguous opportunities into funded, measured results."
          aria-invalid={errors.line ? true : undefined}
          aria-describedby={errors.line ? `${id}-line-error` : undefined}
          onChange={(e) => setLine(e.target.value)}
        />
        <FieldError id={`${id}-line-error`} message={errors.line} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Target roles</p>
        {targetRoles.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Target roles">
            {targetRoles.map((role) => (
              <li
                key={role}
                className="rounded-(--radius-pill) bg-muted px-3 py-1 text-sm text-foreground"
              >
                {role}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None set yet.</p>
        )}
        <p className="text-sm text-muted-foreground">
          These are your search terms.{" "}
          <Link
            to={SEARCH_TERMS_HREF}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Change them in Jobs
          </Link>{" "}
          (Find jobs › automatic run).
        </p>
      </div>
      <ChipListEditor
        label="Industries"
        items={industries}
        onChange={setIndustries}
        placeholder="e.g. Insurance"
        maxLength={80}
        error={industryError}
      />
      <PanelFooter saving={saveEntry.isPending} onCancel={onDone} />
    </form>
  );
};

export const BrandSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetRoles: string[];
  /** Shown when no brand line is saved (e.g. the resume headline). */
  fallbackLine?: string | null;
}> = ({ open, onOpenChange, targetRoles, fallbackLine }) => {
  const entries = useProfileEntries();
  return (
    <PanelSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit your brand"
      description="One line on who you are and the result you bring, plus the industries you know."
    >
      <EntriesGate query={entries}>
        {(data) => (
          <BrandForm
            initial={data.brand ?? { line: fallbackLine ?? "", industries: [] }}
            targetRoles={targetRoles}
            onDone={() => onOpenChange(false)}
          />
        )}
      </EntriesGate>
    </PanelSheet>
  );
};

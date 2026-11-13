import { X } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Right-hand side panel shared by every About you editor. */
export const PanelSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ open, onOpenChange, title, description, children }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
      <SheetHeader>
        <SheetTitle className="font-heading font-(weight:--heading-weight)">
          {title}
        </SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
);

/** Renders the form once saved entries load; loading and error otherwise. */
export function EntriesGate<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isError: boolean; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
}): React.ReactElement {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p>Couldn't load your saved profile.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

export const FieldError: React.FC<{ id: string; message?: string }> = ({
  id,
  message,
}) =>
  message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;

/** Save / Cancel row at the bottom of a panel form. */
export const PanelFooter: React.FC<{
  saving: boolean;
  onCancel: () => void;
  children?: React.ReactNode;
}> = ({ saving, onCancel, children }) => (
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
    <div>{children}</div>
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  </div>
);

/**
 * Editable list of short text chips: type and press Enter (or Add) to add,
 * the × button removes one.
 */
export const ChipListEditor: React.FC<{
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  error?: string;
  maxLength?: number;
}> = ({ label, items, onChange, placeholder, error, maxLength }) => {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value]);
    }
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {items.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} list`}>
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-(--radius-pill) border py-0.5 pr-1 pl-3 text-sm"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="rounded-full p-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-3.5" />
                <span className="sr-only">Remove {item}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add<span className="sr-only"> {label}</span>
        </Button>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
};

/** Toggle chip used for multi-selects (themes, stories, values). */
export const ToggleChip: React.FC<{
  pressed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ pressed, onToggle, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onToggle}
    className={cn(
      "rounded-(--radius-pill) border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      pressed
        ? "border-transparent bg-primary text-primary-foreground"
        : "hover:bg-accent hover:text-accent-foreground",
    )}
  >
    {children}
  </button>
);

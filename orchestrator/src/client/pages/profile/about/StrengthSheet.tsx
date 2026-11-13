import type {
  ProfileActionId,
  ProfileStrength,
  ProfileStrengthCheck,
} from "@shared/types";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { OnEdit } from "./parts";

const ACTION_LABELS: Record<ProfileActionId, string> = {
  "edit-resume": "Edit resume",
  "add-story": "Add a story",
  "edit-pitch": "Edit pitch",
  "edit-values": "Edit values",
  "edit-brand": "Edit brand",
};

function barTone(check: ProfileStrengthCheck): string {
  if (check.points >= check.max) return "bg-success";
  if (check.max > 0 && check.points / check.max >= 0.6) return "bg-info";
  return "bg-warning";
}

const CheckRow: React.FC<{ check: ProfileStrengthCheck; onEdit: OnEdit }> = ({
  check,
  onEdit,
}) => {
  const pct = check.max > 0 ? (check.points / check.max) * 100 : 0;
  const points = Math.round(check.points * 10) / 10;
  return (
    <li className="space-y-2 border-b pb-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{check.label}</h3>
        <span className="font-mono text-sm tabular-nums">
          {points} / {check.max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", barTone(check))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{check.how}</p>
      {check.fix ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{check.fix}</p>
          {check.action ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit({ kind: check.action as ProfileActionId })}
            >
              {ACTION_LABELS[check.action]}
              <span className="sr-only"> ({check.label})</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

export const StrengthSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strength: ProfileStrength;
  onEdit: OnEdit;
}> = ({ open, onOpenChange, strength, onEdit }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
      <SheetHeader>
        <SheetTitle className="font-heading font-(weight:--heading-weight)">
          How your profile is scored
        </SheetTitle>
        <SheetDescription>
          Six checks, each worth a share of 100. Checks are measured against the
          jobs you're targeting, so the score moves when your targets do.
        </SheetDescription>
      </SheetHeader>
      <p>
        <span className="font-mono text-3xl font-semibold tabular-nums">
          {Math.round(strength.total)}
        </span>{" "}
        <span className="text-sm text-muted-foreground">/ {strength.max}</span>
      </p>
      <ul className="space-y-4" aria-label="Strength checks">
        {strength.checks.map((check) => (
          <CheckRow key={check.id} check={check} onEdit={onEdit} />
        ))}
      </ul>
    </SheetContent>
  </Sheet>
);

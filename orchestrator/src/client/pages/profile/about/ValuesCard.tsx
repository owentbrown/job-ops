import type { ProfileValuesInsight } from "@shared/types";
import { Pencil, Star } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CardHeading,
  Chip,
  EmptyState,
  labelClass,
  type OnEdit,
} from "./parts";

const IDEAL = [
  { key: "size", left: "Startup", right: "Enterprise" },
  { key: "management", left: "Hands-on", right: "Managing" },
  { key: "office", left: "Remote", right: "In office" },
] as const;

const IdealScale: React.FC<{ left: string; right: string; value: number }> = ({
  left,
  right,
  value,
}) => (
  <div
    role="img"
    aria-label={`${left} to ${right}: ${value} of 100`}
    className="space-y-1"
  >
    <div
      aria-hidden
      className="flex justify-between text-xs text-muted-foreground"
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
    <div aria-hidden className="relative h-1.5 rounded-full bg-muted">
      <span
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
        style={{ left: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);

export const ValuesCard: React.FC<{
  values: ProfileValuesInsight;
  onEdit: OnEdit;
}> = ({ values, onEdit }) => {
  const edit = () => onEdit({ kind: "edit-values" });
  const empty = values.items.length === 0 && !values.ideal;
  // Starred values first.
  const items = [...values.items].sort(
    (a, b) => Number(b.starred) - Number(a.starred),
  );
  return (
    <Card aria-labelledby="about-values">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading id="about-values" title="What drives you">
          {empty ? null : (
            <Button size="sm" variant="outline" onClick={edit}>
              <Pencil aria-hidden />
              Edit<span className="sr-only"> values</span>
            </Button>
          )}
        </CardHeading>
        {empty ? (
          <EmptyState
            action={
              <Button size="sm" onClick={edit}>
                Add your values
              </Button>
            }
          >
            Name what matters to you in a role and where you'd like to land:
            startup or enterprise, hands-on or managing, remote or in office.
          </EmptyState>
        ) : (
          <>
            {items.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Values">
                {items.map((v) => (
                  <Chip
                    key={v.label}
                    className={cn(
                      v.starred &&
                        "border-transparent bg-primary font-medium text-primary-foreground",
                    )}
                  >
                    {v.starred ? (
                      <>
                        <Star aria-hidden className="size-3.5 fill-current" />
                        <span className="sr-only">Starred: </span>
                      </>
                    ) : null}
                    {v.label}
                  </Chip>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No values named yet.
              </p>
            )}
            <div className="space-y-3">
              <h3 className={cn(labelClass, "text-muted-foreground")}>
                Ideal role
              </h3>
              {values.ideal ? (
                IDEAL.map((s) => (
                  <IdealScale
                    key={s.key}
                    left={s.left}
                    right={s.right}
                    value={values.ideal?.[s.key] ?? 50}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Not set yet.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

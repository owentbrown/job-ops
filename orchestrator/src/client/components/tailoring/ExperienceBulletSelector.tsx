import {
  type ExperienceBulletCatalogItem,
  type ExperienceBulletSelection,
  getKeptBulletIndices,
} from "@shared/resume-experience-bullets";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ExperienceBulletSelectorProps {
  catalog: ExperienceBulletCatalogItem[];
  selection: ExperienceBulletSelection | null;
  onToggleBullet: (itemId: string, index: number, bulletCount: number) => void;
  onKeepAll: (itemId: string) => void;
  disabled: boolean;
}

/** Kept and total bullet counts across roles that have bullets. */
export function countKeptExperienceBullets(
  catalog: ExperienceBulletCatalogItem[],
  selection: ExperienceBulletSelection | null,
): { kept: number; total: number } {
  let kept = 0;
  let total = 0;
  for (const item of catalog) {
    total += item.bullets.length;
    kept += getKeptBulletIndices(selection, item).length;
  }
  return { kept, total };
}

export const ExperienceBulletSelector: React.FC<
  ExperienceBulletSelectorProps
> = ({ catalog, selection, onToggleBullet, onKeepAll, disabled }) => {
  const roles = catalog.filter((item) => item.bullets.length > 0);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Unchecked bullets are left out of this job's PDF only. Your base resume
        keeps every bullet for matching and Ghostwriter. In the personal LaTeX
        layout, trailing roles with at most one bullet are grouped under Earlier
        Experience.
      </p>

      {roles.map((item) => {
        const kept = new Set(getKeptBulletIndices(selection, item));
        const isTrimmed = kept.size < item.bullets.length;
        const title =
          [item.position, item.company].filter(Boolean).join(" · ") ||
          "Untitled role";

        return (
          <section
            key={item.id}
            aria-label={`Bullets for ${title}`}
            className="rounded-md border border-border/55 bg-background/45 p-2.5"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground/90">
                  {title}
                </p>
                {item.period ? (
                  <p className="text-[10px] text-muted-foreground">
                    {item.period}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
                    isTrimmed
                      ? "border-info/20 bg-info/10 text-info"
                      : "border-border/60 bg-muted/20 text-muted-foreground",
                  )}
                >
                  {kept.size}/{item.bullets.length} kept
                </span>
                {isTrimmed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => onKeepAll(item.id)}
                    disabled={disabled}
                    aria-label={`Keep all bullets for ${title}`}
                  >
                    Keep all
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              {item.bullets.map((bullet, index) => {
                const checked = kept.has(index);
                const inputId = `experience-bullet-${item.id}-${index}`;
                return (
                  <label
                    key={inputId}
                    htmlFor={inputId}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-[11px] leading-5 transition-colors",
                      checked
                        ? "border-primary/30 bg-primary/5 text-foreground/90"
                        : "border-border/40 bg-muted/5 text-muted-foreground line-through decoration-muted-foreground/50",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={() =>
                        onToggleBullet(item.id, index, item.bullets.length)
                      }
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">{bullet}</span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

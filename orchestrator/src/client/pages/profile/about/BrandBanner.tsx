import type { ProfileBrandInsight, ProfileStrength } from "@shared/types";
import { Pencil } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { labelClass, type OnEdit } from "./parts";
import { StrengthRing } from "./StrengthRing";

/**
 * Brand home header in the theme's sidebar colours (sidebar / sidebar
 * foreground / sidebar accent are contrast-tested pairs in every theme).
 */
export const BrandBanner: React.FC<{
  brand: ProfileBrandInsight;
  strength: ProfileStrength;
  bestFitJobCount: number;
  onEdit: OnEdit;
  onOpenStrength: () => void;
}> = ({ brand, strength, bestFitJobCount, onEdit, onOpenStrength }) => {
  const chips = [
    brand.targetRoles.length ? brand.targetRoles.join(" · ") : null,
    brand.location,
    brand.industries.length ? brand.industries.join(" · ") : null,
  ].filter((c): c is string => Boolean(c));

  return (
    <section
      aria-labelledby="about-brand"
      className="rounded-(--radius) bg-sidebar p-(--density-pad) text-sidebar-foreground shadow-(--card-shadow) sm:p-6"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-heading text-lg font-semibold text-sidebar-accent-foreground"
          >
            {brand.initials || "?"}
          </span>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="about-brand" className={labelClass}>
                Your brand
              </h2>
              <button
                type="button"
                onClick={() => onEdit({ kind: "edit-brand" })}
                className="inline-flex items-center gap-1 rounded-(--radius-button) border border-sidebar-border px-2 py-0.5 text-xs font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Pencil aria-hidden className="size-3" />
                Edit<span className="sr-only"> brand</span>
              </button>
            </div>
            {brand.line ? (
              <p className="max-w-2xl font-heading text-xl font-(weight:--heading-weight) leading-snug tracking-(--heading-tracking) sm:text-2xl">
                {brand.line}
              </p>
            ) : (
              <p className="max-w-2xl text-base">
                Add a one-line brand: who you are and the result you bring.
              </p>
            )}
            {chips.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Brand details">
                {chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-(--radius-pill) bg-sidebar-accent px-3 py-1 text-sm text-sidebar-accent-foreground"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-4 md:shrink-0">
          <StrengthRing total={strength.total} max={strength.max} />
          <div className="space-y-1">
            <p className="font-medium">Profile strength</p>
            <p className="text-sm">
              {bestFitJobCount > 0
                ? `Scored against ${bestFitJobCount} best-fit job${bestFitJobCount === 1 ? "" : "s"}`
                : "Scored against your resume"}
            </p>
            <button
              type="button"
              onClick={onOpenStrength}
              className={cn(
                "text-sm font-medium underline underline-offset-4 hover:no-underline",
                "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              )}
            >
              See how it's scored
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

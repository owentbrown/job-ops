import type { ProfileBrandInsight, ProfileStrength } from "@shared/types";
import { Pencil } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { OnEdit } from "./parts";
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
      className="relative isolate overflow-hidden rounded-(--radius) bg-sidebar p-5 text-sidebar-foreground shadow-(--card-shadow) sm:p-7"
    >
      {/* Decorative circles: theme tokens at low opacity, behind the content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full sm:size-80"
        style={{
          background:
            "color-mix(in oklab, var(--sidebar-primary) 20%, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-24 -bottom-32 -z-10 size-56 rounded-full sm:right-40"
        style={{
          background:
            "color-mix(in oklab, var(--nav, var(--action, var(--sidebar-primary))) 30%, transparent)",
        }}
      />
      <button
        type="button"
        onClick={() => onEdit({ kind: "edit-brand" })}
        className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Pencil aria-hidden className="size-4" />
        <span className="sr-only">Edit brand</span>
      </button>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-center">
          <span
            aria-hidden
            data-testid="brand-initials"
            className="flex aspect-square size-22 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-heading text-3xl leading-none font-bold text-sidebar-accent-foreground tabular-nums sm:size-24 sm:text-[2.125rem]"
          >
            {brand.initials || "?"}
          </span>
          <div className="min-w-0 flex-1 space-y-3 pr-10 sm:pr-0">
            <h2
              id="about-brand"
              className="text-xs font-semibold tracking-[0.08em] uppercase"
            >
              Your brand
            </h2>
            {brand.line ? (
              <p className="max-w-3xl font-heading text-[1.5rem] leading-tight font-bold tracking-(--heading-tracking) text-balance sm:text-[1.75rem] xl:text-[2rem]">
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
        <div className="flex items-center gap-4 self-start rounded-(--radius-tile) bg-sidebar-foreground/8 p-4 lg:shrink-0 lg:self-center">
          <StrengthRing total={strength.total} max={strength.max} />
          <div className="space-y-1">
            <p className="font-semibold">Profile strength</p>
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

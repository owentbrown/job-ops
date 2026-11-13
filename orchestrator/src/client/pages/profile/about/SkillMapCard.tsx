import type {
  ProfileDataState,
  ProfileSkillInsight,
  SkillProofLevel,
  SkillQuadrant,
} from "@shared/types";
import { Pencil, Sparkles } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CardHeading,
  EmptyState,
  labelClass,
  type OnEdit,
  TOO_EARLY_COPY,
} from "./parts";

/**
 * Proof sits on the x axis. The server splits strong proof at 2, so levels
 * below 2 land in the left half and 2+ in the right half.
 */
const PROOF_X: Record<SkillProofLevel, number> = {
  0: 8,
  0.5: 20,
  1: 34,
  2: 64,
  3: 86,
};

const QUADRANTS: Array<{
  id: SkillQuadrant;
  title: string;
  /** Position of the quarter inside the plot. */
  place: string;
  /** Tinted fill for the quarter. */
  fill: string;
  dot: string;
}> = [
  {
    id: "prove",
    title: "Prove these",
    place: "left-0 top-0 items-start",
    fill: "bg-warning/10",
    dot: "bg-warning",
  },
  {
    id: "lead-with",
    title: "Lead with these",
    place: "right-0 top-0 items-end",
    fill: "bg-success/10",
    dot: "bg-success",
  },
  {
    id: "nice-to-have",
    title: "Nice to have",
    place: "bottom-0 left-0 items-start justify-end",
    fill: "bg-muted/40",
    dot: "bg-muted-foreground",
  },
  {
    id: "hidden",
    title: "Hidden strengths",
    place: "bottom-0 right-0 items-end justify-end",
    fill: "bg-info/10",
    dot: "bg-info",
  },
];

const quadrantMeta = (q: SkillQuadrant) =>
  QUADRANTS.find((x) => x.id === q) ?? QUADRANTS[0];

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** Spread dots that share a proof column so they overlap less. */
function placeSkills(skills: ProfileSkillInsight[]) {
  const seen = new Map<string, number>();
  return skills.map((skill) => {
    const bucket = `${skill.proof}:${Math.round(skill.demandPct / 10)}`;
    const n = seen.get(bucket) ?? 0;
    seen.set(bucket, n + 1);
    return {
      skill,
      left: clamp(PROOF_X[skill.proof] + (n % 3) * 4, 4, 96),
      bottom: clamp(skill.demandPct, 5, 93) + Math.floor(n / 3) * 4,
    };
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Proof level in plain words (server: compute.ts proofLevel). */
const PROOF_WORDS: Record<SkillProofLevel, string> = {
  0: "no proof yet",
  0.5: "listed on your resume",
  1: "used in a role",
  2: "backed by a number in a role",
  3: "backed by a story",
};

const demandWords = (skill: ProfileSkillInsight, bestFitJobCount: number) =>
  bestFitJobCount > 0
    ? `${skill.demandPct}% of your ${bestFitJobCount} best-fit job${bestFitJobCount === 1 ? "" : "s"}`
    : `${skill.demandPct}% of best-fit jobs`;

const SkillPlot: React.FC<{
  skills: ProfileSkillInsight[];
  bestFitJobCount: number;
}> = ({ skills, bestFitJobCount }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const tooltipId = useId();
  const placed = placeSkills(skills);
  const active = placed.find((p) => p.skill.id === activeId) ?? null;
  return (
    <div className="flex gap-2">
      <div
        aria-hidden
        className="flex w-5 shrink-0 items-center justify-center"
      >
        <span className="-rotate-90 whitespace-nowrap text-xs text-muted-foreground">
          Jobs ask for it more →
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div
          data-testid="skill-plot"
          className="relative aspect-4/3 w-full sm:aspect-16/9 lg:aspect-4/3"
        >
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-(--radius) border"
          >
            {QUADRANTS.map((q) => (
              <div
                key={q.id}
                className={cn(
                  "absolute flex h-1/2 w-1/2 flex-col p-2",
                  q.place,
                  q.fill,
                )}
              >
                <span className={cn(labelClass, "text-foreground")}>
                  {q.title}
                </span>
              </div>
            ))}
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          </div>
          {placed.map(({ skill, left, bottom }) => {
            const isActive = skill.id === activeId;
            return (
              <button
                key={skill.id}
                type="button"
                aria-label={`${skill.label}: ${demandWords(skill, bestFitJobCount)}, ${PROOF_WORDS[skill.proof]}`}
                aria-describedby={isActive ? tooltipId : undefined}
                data-active={isActive || undefined}
                onMouseEnter={() => setActiveId(skill.id)}
                onMouseLeave={() =>
                  setActiveId((id) => (id === skill.id ? null : id))
                }
                onFocus={() => setActiveId(skill.id)}
                onBlur={() =>
                  setActiveId((id) => (id === skill.id ? null : id))
                }
                onClick={() => setActiveId(skill.id)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setActiveId(null);
                }}
                className={cn(
                  "absolute flex size-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "z-20" : "z-10",
                )}
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full ring-2 ring-card transition-transform motion-reduce:transition-none",
                    quadrantMeta(skill.quadrant).dot,
                    isActive && "scale-150 ring-foreground",
                  )}
                />
              </button>
            );
          })}
          {active ? (
            <div
              id={tooltipId}
              role="tooltip"
              className={cn(
                "pointer-events-none absolute z-30 w-max max-w-56 rounded-(--radius-popover) border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
                active.left < 25
                  ? "-translate-x-2"
                  : active.left > 75
                    ? "-translate-x-[calc(100%-0.5rem)]"
                    : "-translate-x-1/2",
                active.bottom > 70
                  ? "translate-y-[calc(100%+1rem)]"
                  : "-translate-y-4",
              )}
              style={{
                left: `${active.left}%`,
                bottom: `${active.bottom}%`,
              }}
            >
              <p className="font-semibold text-sm">{active.skill.label}</p>
              <p>Asked for in {demandWords(active.skill, bestFitJobCount)}</p>
              <p className="text-muted-foreground">
                Proof: {PROOF_WORDS[active.skill.proof]}
              </p>
            </div>
          ) : null}
        </div>
        <p aria-hidden className="text-center text-xs text-muted-foreground">
          You can back it up better →
        </p>
      </div>
    </div>
  );
};

/** Screen-reader equivalent of the plot. */
const SkillList: React.FC<{ skills: ProfileSkillInsight[] }> = ({ skills }) => {
  const ordered: SkillQuadrant[] = [
    "prove",
    "lead-with",
    "hidden",
    "nice-to-have",
  ];
  const heading: Record<SkillQuadrant, string> = {
    prove: "Skills to prove next",
    "lead-with": "Lead with these",
    hidden: "Hidden strengths",
    "nice-to-have": "Nice to have",
  };
  return (
    <div className="sr-only">
      {ordered.map((q) => {
        const items = skills.filter((s) => s.quadrant === q);
        if (!items.length) return null;
        return (
          <div key={q}>
            <h3>{heading[q]}</h3>
            <ul>
              {items.map((s) => (
                <li key={s.id}>
                  {s.label}: {s.demandPct}% of best-fit jobs, proof {s.proof} of
                  3
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

export const SkillMapCard: React.FC<{
  dataState: ProfileDataState;
  skills: ProfileSkillInsight[];
  bestFitJobCount: number;
  refreshedAt: string | null;
  onEdit: OnEdit;
}> = ({ dataState, skills, bestFitJobCount, refreshedAt, onEdit }) => {
  const showPlot = dataState === "ok" && skills.length > 0;
  return (
    <Card aria-labelledby="about-skills" className="h-full">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading
          id="about-skills"
          title="Skill map"
          subtitle="Which skills to talk about, and which ones you still need a story for"
        />
        {dataState === "no-resume" ? (
          <EmptyState>
            Import your resume to see which skills you can already prove.
          </EmptyState>
        ) : !showPlot ? (
          <EmptyState>{TOO_EARLY_COPY}</EmptyState>
        ) : (
          <>
            <SkillList skills={skills} />
            <SkillPlot skills={skills} bestFitJobCount={bestFitJobCount} />
          </>
        )}
        <div data-testid="skill-actions" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit({ kind: "edit-skills" })}
            >
              <Pencil aria-hidden />
              Edit skills
            </Button>
            {dataState !== "no-resume" ? (
              // The refresh itself lives in the skills panel.
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit({ kind: "edit-skills" })}
              >
                <Sparkles aria-hidden />
                Refresh with AI
              </Button>
            ) : null}
          </div>
          {showPlot && refreshedAt ? (
            <p className="text-xs text-muted-foreground">
              Skills refreshed with AI on {formatDate(refreshedAt)}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

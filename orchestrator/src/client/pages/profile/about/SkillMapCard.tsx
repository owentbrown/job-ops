import type {
  ProfileDataState,
  ProfileSkillInsight,
  SkillProofLevel,
  SkillQuadrant,
} from "@shared/types";
import { Pencil, Sparkles } from "lucide-react";
import type React from "react";
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

/** Spread dots that share a proof column so labels overlap less. */
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

const SkillPlot: React.FC<{ skills: ProfileSkillInsight[] }> = ({ skills }) => (
  <div className="flex gap-2">
    <div className="flex w-5 shrink-0 items-center justify-center">
      <span className="-rotate-90 whitespace-nowrap text-xs text-muted-foreground">
        Jobs ask for it more →
      </span>
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div
        aria-hidden
        className="relative aspect-4/3 w-full overflow-hidden rounded-(--radius) border sm:aspect-16/9"
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
            <span className={cn(labelClass, "text-foreground")}>{q.title}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {placeSkills(skills).map(({ skill, left, bottom }) => (
          <div
            key={skill.id}
            className="absolute flex -translate-x-1/2 translate-y-1/2 items-center gap-1"
            style={{ left: `${left}%`, bottom: `${bottom}%` }}
          >
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full ring-2 ring-card",
                quadrantMeta(skill.quadrant).dot,
              )}
            />
            <span className="max-w-28 truncate rounded-sm bg-card/80 px-1 text-[11px] leading-tight text-foreground">
              {skill.label}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span>Listed, or used in a role</span>
        <span className="text-right">Backed by a number or a story</span>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        You can back it up better →
      </p>
    </div>
  </div>
);

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
  onRefresh?: () => void;
  refreshing?: boolean;
}> = ({
  dataState,
  skills,
  bestFitJobCount,
  refreshedAt,
  onEdit,
  onRefresh,
  refreshing = false,
}) => {
  const top = skills[0];
  const showPlot = dataState === "ok" && skills.length > 0;
  return (
    <Card aria-labelledby="about-skills">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading
          id="about-skills"
          title="Skill map"
          subtitle="Which skills to talk about, and which ones you still need a story for"
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit({ kind: "edit-skills" })}
          >
            <Pencil aria-hidden />
            Edit skills
          </Button>
          {onRefresh && dataState !== "no-resume" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <Sparkles aria-hidden />
              {refreshing ? "Refreshing…" : "Refresh with AI"}
            </Button>
          ) : null}
        </CardHeading>
        {dataState === "no-resume" ? (
          <EmptyState>
            Import your resume to see which skills you can already prove.
          </EmptyState>
        ) : !showPlot ? (
          <EmptyState>{TOO_EARLY_COPY}</EmptyState>
        ) : (
          <>
            <SkillList skills={skills} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
              <SkillPlot skills={skills} />
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Up</span> = share of your{" "}
                  {bestFitJobCount} best-fit job
                  {bestFitJobCount === 1 ? "" : "s"} that mention it
                  {top ? ` (${top.label}: ${top.demandPct}%)` : ""}.
                </p>
                <p>
                  <span className="font-semibold">Right</span> = how much proof
                  your profile has. Top-left skills are the ones to write a
                  story for next.
                </p>
                {refreshedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Skills refreshed with AI on {formatDate(refreshedAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

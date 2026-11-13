import type { ProfilePitchInsight } from "@shared/types";
import { BookOpen, Heart, Pencil, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
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

const LENGTHS = [
  { key: "s15", label: "15s", long: "15-second" },
  { key: "s30", label: "30s", long: "30-second" },
  { key: "s60", label: "60s", long: "60-second" },
] as const;

type LengthKey = (typeof LENGTHS)[number]["key"];

export const PitchCard: React.FC<{
  pitch: ProfilePitchInsight;
  onEdit: OnEdit;
}> = ({ pitch, onEdit }) => {
  const [length, setLength] = useState<LengthKey>("s30");
  const current = LENGTHS.find((l) => l.key === length) ?? LENGTHS[1];
  const text = pitch[length].trim();
  const { stories, values } = pitch.builtFrom;
  const edit = () => onEdit({ kind: "edit-pitch" });
  const writeWithAi = () => onEdit({ kind: "edit-pitch", autoWrite: true });

  return (
    <Card aria-labelledby="about-pitch">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading id="about-pitch" title="Elevator pitch">
          {pitch.isEmpty ? null : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={writeWithAi}>
                <Sparkles aria-hidden />
                Rewrite with AI
              </Button>
              <Button size="sm" variant="outline" onClick={edit}>
                <Pencil aria-hidden />
                Edit<span className="sr-only"> pitch</span>
              </Button>
            </div>
          )}
        </CardHeading>
        {pitch.isEmpty ? (
          <EmptyState
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={writeWithAi}>
                  <Sparkles aria-hidden />
                  Write with AI
                </Button>
                <Button size="sm" variant="outline" onClick={edit}>
                  Write your pitch
                </Button>
              </div>
            }
          >
            Say who you are and what you're aiming for in 15, 30 and 60 seconds.
            Recruiters and networking calls ask for all three.
          </EmptyState>
        ) : (
          <>
            <fieldset
              aria-label="Pitch length"
              className="m-0 inline-flex min-w-0 rounded-(--radius-button) border p-0.5"
            >
              {LENGTHS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={length === l.key}
                  onClick={() => setLength(l.key)}
                  className={cn(
                    "rounded-(--radius-button) px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    length === l.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </fieldset>
            {text ? (
              <blockquote className="border-l-2 border-primary pl-4 text-base leading-relaxed">
                {text}
              </blockquote>
            ) : (
              <p className="text-sm text-muted-foreground">
                No {current.long} version yet.{" "}
                <button
                  type="button"
                  onClick={edit}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Write it
                </button>
              </p>
            )}
            {stories.length || values.length ? (
              <div className="space-y-2">
                <p className={cn(labelClass, "text-muted-foreground")}>
                  Built from
                </p>
                <ul className="flex flex-wrap gap-2">
                  {stories.map((s) => (
                    <Chip key={`story-${s.id}`}>
                      <BookOpen aria-hidden className="size-3.5" />
                      <span className="sr-only">Story: </span>
                      {s.title}
                    </Chip>
                  ))}
                  {values.map((v) => (
                    <Chip key={`value-${v}`}>
                      <Heart aria-hidden className="size-3.5" />
                      <span className="sr-only">Value: </span>
                      {v}
                    </Chip>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

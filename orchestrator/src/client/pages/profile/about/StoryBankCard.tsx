import type { ProfileStoriesInsight } from "@shared/types";
import { Plus } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CardHeading,
  EmptyState,
  labelClass,
  type OnEdit,
  THEME_LABELS,
} from "./parts";

export const StoryBankCard: React.FC<{
  stories: ProfileStoriesInsight;
  onEdit: OnEdit;
}> = ({ stories, onEdit }) => {
  const add = () => onEdit({ kind: "add-story" });
  return (
    <Card aria-labelledby="about-stories">
      <CardContent className="space-y-4 pt-(--density-pad)">
        <CardHeading
          id="about-stories"
          title="Story bank"
          subtitle={
            stories.total
              ? `${stories.total} saved stor${stories.total === 1 ? "y" : "ies"}`
              : "None written yet"
          }
        >
          <Button size="sm" variant="outline" onClick={add}>
            <Plus aria-hidden />
            Add story
          </Button>
        </CardHeading>
        <ul
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          aria-label="Stories by theme"
        >
          {stories.themes.map(({ theme, count }) => (
            <li
              key={theme}
              className={cn(
                "flex flex-col gap-0.5 rounded-(--radius-tile) p-3",
                count > 0
                  ? "bg-(--tile-tint-1) text-foreground"
                  : "border border-dashed text-muted-foreground",
              )}
            >
              <span className="font-mono text-xl font-semibold tabular-nums">
                {count}
              </span>
              <span className={labelClass}>{THEME_LABELS[theme]}</span>
              {count === 0 ? (
                <span className="sr-only">no stories yet</span>
              ) : null}
            </li>
          ))}
        </ul>
        {stories.top.length ? (
          <div className="space-y-2">
            <h3 className={cn(labelClass, "text-muted-foreground")}>
              Strongest results
            </h3>
            <ul className="space-y-2">
              {stories.top.slice(0, 3).map((story) => (
                <li key={story.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onEdit({ kind: "edit-story", storyId: story.id })
                    }
                    className="flex w-full items-start gap-3 rounded-(--radius) border p-3 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                    >
                      {story.title.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-medium">{story.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {[
                          ...story.themes.map((t) => THEME_LABELS[t]),
                          story.metric,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState>
            Your best results, written as short stories you can tell in an
            interview. Each theme you cover adds to your profile strength.
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
};

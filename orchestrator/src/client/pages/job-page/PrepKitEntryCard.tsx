import type { Job } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, NotebookPen } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import * as api from "@/client/api";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";

type PrepKitEntryCardProps = {
  job: Job;
  baseJobPath: string;
  navigationState?: { jobPageBackTo: string };
};

/** Overview entry point to the prep kit, for jobs you've applied to. */
export const PrepKitEntryCard: React.FC<PrepKitEntryCardProps> = ({
  job,
  baseJobPath,
  navigationState,
}) => {
  const isActive = job.status === "applied" || job.status === "in_progress";
  const prepQuery = useQuery({
    queryKey: queryKeys.jobs.prepKit(job.id),
    queryFn: () => api.getPrepKit(job.id),
    enabled: isActive,
  });
  if (!isActive) return null;

  const kit = prepQuery.data?.kit ?? null;
  const jots = prepQuery.data?.jots.length ?? 0;
  const questionsLeft = kit?.questions.filter((q) => !q.answered).length ?? 0;

  const status = kit
    ? [
        `${kit.sections.length} cards`,
        `${questionsLeft} question${questionsLeft === 1 ? "" : "s"} to ask`,
        jots > 0 ? `${jots} jot${jots === 1 ? "" : "s"} to wrap up` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Cue cards for your next call: scan, dig, jot.";

  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Prep kit</div>
          <div className="text-sm text-muted-foreground">{status}</div>
        </div>
      </div>
      <Button asChild size="sm" variant={kit ? "outline" : "default"}>
        <Link to={`${baseJobPath}/prep`} state={navigationState}>
          {kit ? "Open prep kit" : "Build prep kit"}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </article>
  );
};

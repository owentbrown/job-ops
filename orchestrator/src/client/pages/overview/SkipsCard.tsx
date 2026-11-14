import {
  type OverviewSkippedJob,
  SKIP_REASON_NONE_LABEL,
} from "@shared/types.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import * as api from "@/client/api";
import { showErrorToast } from "@/client/lib/error-toast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CatchUpNotice } from "./CatchUpNotice";
import { overviewLabelClass } from "./label";

export const SkipsCard: React.FC<{
  rows?: { reason: string; count: number }[];
  highScoreSkipped: OverviewSkippedJob[];
}> = ({ rows = [], highScoreSkipped }) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const queryClient = useQueryClient();
  const reconsider = useMutation({
    mutationFn: (jobId: string) =>
      api.updateJob(jobId, { status: "discovered" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.overview.all });
      toast.success("Moved back to Discovered");
    },
    onError: (error) => showErrorToast(error, "Couldn't move the job"),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-(--density-pad)">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Why you skip</h3>
          <span className="text-xs text-muted-foreground">All time</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Skip reasons appear once you start picking them when you skip a job.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.reason} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate">{row.reason}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {row.count}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-2 rounded-full",
                      row.reason === SKIP_REASON_NONE_LABEL
                        ? "bg-muted-foreground/60"
                        : "bg-primary",
                    )}
                    style={{ width: `${(row.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <CatchUpNotice kind="skips" noun="skipped jobs" />
        <h4 className={cn(overviewLabelClass, "text-muted-foreground")}>
          Skipped but scored 80+
        </h4>
        {highScoreSkipped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skipped jobs scored 80+.
          </p>
        ) : (
          <ul className="space-y-2">
            {highScoreSkipped.map((job) => (
              <li
                key={job.jobId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    to={`/job/${job.jobId}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {job.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {job.employer}
                  </span>
                </div>
                <span className="font-mono tabular-nums">{job.score}</span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Reconsider ${job.title}`}
                  disabled={reconsider.isPending}
                  onClick={() => reconsider.mutate(job.jobId)}
                >
                  Reconsider
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

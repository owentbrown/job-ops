import type { OverviewSkippedJob } from "@shared/types.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import * as api from "@/client/api";
import { showErrorToast } from "@/client/lib/error-toast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const SkipsCard: React.FC<{
  highScoreSkipped: OverviewSkippedJob[];
}> = ({ highScoreSkipped }) => {
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
    <Card className="border-border/60 shadow-none">
      <CardContent className="space-y-4 p-6">
        <h3 className="font-heading text-sm font-semibold">Why you skip</h3>
        <p className="text-sm text-muted-foreground">
          Skip reasons appear once you start picking them when you skip a job.
        </p>
        <h4 className="text-xs font-semibold text-muted-foreground">
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

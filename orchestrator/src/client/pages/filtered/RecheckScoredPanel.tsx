import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Runs the saved rules (free, no AI) over jobs that were scored before the
 * rules changed. Lists first; moving needs a second click.
 */
export const RecheckScoredPanel: React.FC<{
  rulesDirty: boolean;
  filteredJobsKey: readonly unknown[];
}> = ({ rulesDirty, filteredJobsKey }) => {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<api.RecheckScoredResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: () => api.recheckScoredJobs(false),
    onSuccess: (data) => {
      setMessage(null);
      setResult(data);
    },
    onError: (err) => showErrorToast(err, "Could not re-check scored jobs"),
  });

  const apply = useMutation({
    mutationFn: () => api.recheckScoredJobs(true),
    onSuccess: async (data) => {
      setResult(null);
      setMessage(
        `Moved ${data.moved} job${data.moved === 1 ? "" : "s"} to Filtered. Restore any you want back.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: filteredJobsKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all }),
      ]);
    },
    onError: (err) => showErrorToast(err, "Could not move the jobs"),
  });

  const drops = result?.drops ?? [];

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Re-check scored jobs</p>
          <p className="text-xs text-muted-foreground">
            Runs your saved rules over jobs that are already scored and still in
            Discovered. Free: no AI. You see the list before anything moves.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={rulesDirty || check.isPending || apply.isPending}
          onClick={() => check.mutate()}
        >
          {check.isPending ? "Checking…" : "Check now"}
        </Button>
      </div>
      {rulesDirty ? (
        <p className="text-xs text-amber-300">Save your rule changes first</p>
      ) : null}
      {message ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">
            {drops.length === 0
              ? `All ${result.checked} scored jobs pass your rules. Nothing to move.`
              : `${drops.length} of ${result.checked} scored jobs would move to Filtered:`}
          </p>
          {drops.length > 0 ? (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {drops.map((item) => (
                <li key={item.id} className="space-y-0.5 p-3">
                  <p className="break-words text-sm font-medium">
                    {item.title}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {item.employer}
                    {item.location ? ` · ${item.location}` : ""}
                  </p>
                  <p className="break-words text-xs">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            {drops.length > 0 ? (
              <Button
                size="sm"
                disabled={apply.isPending}
                onClick={() => apply.mutate()}
              >
                {apply.isPending
                  ? "Moving…"
                  : `Move ${drops.length} to Filtered`}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={apply.isPending}
              onClick={() => setResult(null)}
            >
              {drops.length > 0 ? "Cancel" : "Close"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

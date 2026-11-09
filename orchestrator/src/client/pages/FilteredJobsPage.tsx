import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrefilterRulesEditor } from "./filtered/PrefilterRulesEditor";

const FILTERED_JOBS_KEY = ["prefilter", "filtered-jobs"] as const;

export const FilteredJobsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: FILTERED_JOBS_KEY,
    queryFn: api.getFilteredJobs,
  });
  const [confirmBacklog, setConfirmBacklog] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setRulesDirty(dirty);
    if (dirty) setConfirmBacklog(false);
  }, []);

  // An armed confirm must not stay armed forever.
  useEffect(() => {
    if (!confirmBacklog) return;
    const timer = setTimeout(() => setConfirmBacklog(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmBacklog]);
  const [notice, setNotice] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: async (id: string) => {
      setRestoringIds((prev) => new Set(prev).add(id));
      try {
        return await api.restoreFilteredJob(id);
      } finally {
        setRestoringIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: FILTERED_JOBS_KEY }),
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all }),
      ]),
    onError: (err) => showErrorToast(err, "Failed to restore job"),
  });
  const backlog = useMutation({
    mutationFn: api.scoreBacklog,
    onSuccess: () => {
      setConfirmBacklog(false);
      setNotice(
        "Started: rules → AI title check → full scoring. Progress shows on the Jobs page.",
      );
    },
    onError: (err) => {
      setConfirmBacklog(false);
      showErrorToast(err, "Could not start the backlog run");
    },
  });
  const jobs = data?.jobs ?? [];

  return (
    <>
      <PageHeader
        icon={Filter}
        title="Filtered"
        subtitle="Pre-score filter: what it removed, and the rules it uses"
        badge={String(jobs.length)}
        actions={
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant={confirmBacklog ? "default" : "outline"}
              disabled={backlog.isPending || rulesDirty}
              onClick={() =>
                confirmBacklog ? backlog.mutate() : setConfirmBacklog(true)
              }
              onBlur={() => setConfirmBacklog(false)}
            >
              {confirmBacklog
                ? "Click again to start (uses LLM credits)"
                : "Filter & score backlog"}
            </Button>
            {rulesDirty ? (
              <span className="text-xs text-amber-300">
                Save your rule changes first
              </span>
            ) : null}
            <span aria-live="polite" className="sr-only">
              {confirmBacklog
                ? "Confirm: click again within 5 seconds to start the backlog run."
                : ""}
            </span>
          </div>
        }
      />
      <PageMain>
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}
        <Tabs defaultValue="filtered">
          <TabsList>
            <TabsTrigger value="filtered">
              Filtered jobs ({jobs.length})
            </TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="filtered" className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive">
                Could not load filtered jobs.
              </p>
            ) : null}
            {!isLoading && !error && jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has been filtered yet.
              </p>
            ) : null}
            {jobs.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words font-medium hover:underline"
                      >
                        {job.title}
                      </a>
                      <p className="text-sm text-muted-foreground">
                        {job.employer}
                        {job.location ? ` · ${job.location}` : ""}
                        {job.salary ? ` · ${job.salary}` : ""}
                      </p>
                      {job.filterLayer || job.filterReason ? (
                        <p className="text-sm">
                          {job.filterLayer ? (
                            <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
                              {job.filterLayer}
                            </span>
                          ) : null}
                          {job.filterReason}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoringIds.has(job.id)}
                      onClick={() => restore.mutate(job.id)}
                    >
                      {restoringIds.has(job.id) ? "Restoring…" : "Restore"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
          <TabsContent
            value="rules"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <PrefilterRulesEditor onDirtyChange={handleDirtyChange} />
          </TabsContent>
        </Tabs>
      </PageMain>
    </>
  );
};

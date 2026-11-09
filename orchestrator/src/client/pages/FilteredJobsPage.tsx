import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
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
  const [notice, setNotice] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: (id: string) => api.restoreFilteredJob(id),
    onSuccess: () => queryClient.invalidateQueries(),
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
          <Button
            size="sm"
            variant={confirmBacklog ? "default" : "outline"}
            disabled={backlog.isPending}
            onClick={() =>
              confirmBacklog ? backlog.mutate() : setConfirmBacklog(true)
            }
          >
            {confirmBacklog
              ? "Click again to start (uses LLM credits)"
              : "Filter & score backlog"}
          </Button>
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
                      <p className="text-sm">
                        <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
                          {job.filterLayer}
                        </span>
                        {job.filterReason}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(job.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
          <TabsContent value="rules">
            <PrefilterRulesEditor />
          </TabsContent>
        </Tabs>
      </PageMain>
    </>
  );
};

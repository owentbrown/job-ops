import * as api from "@client/api";
import { StatusIndicator } from "@client/components/layout";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { EmbeddedPage, PageFrame } from "@client/components/PageFrame";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FilteredJobsPage } from "./FilteredJobsPage";
import { jobListItems } from "./orchestrator/constants";
import { JobListSwiper } from "./orchestrator/filters/JobListSwiper";
import { OrchestratorHeaderActions } from "./orchestrator/OrchestratorHeader";

const JobsIcon: React.FC<{ className?: string }> = () => (
  <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
);

// Mirrors TabsTrigger so the strip looks like the Jobs page tabs.
const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive
      ? "bg-background text-foreground shadow"
      : "text-muted-foreground hover:text-foreground",
  );

/**
 * Jobs > Filtered out: the same header buttons and list switcher as the
 * Jobs page, then the filtered list. Search actions hand off to the Jobs
 * page, where the search form and progress live.
 */
export const JobsFilteredPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const status = useQuery({
    queryKey: queryKeys.pipeline.status(),
    queryFn: api.getPipelineStatus,
    refetchInterval: 15_000,
  });
  const isPipelineRunning = status.data?.isRunning ?? false;
  const items = jobListItems();

  const runLastSearch = async () => {
    try {
      await api.runLastSearch();
      toast.message("Search started", {
        description: "Repeating your last search. This may take a few minutes.",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pipeline.status(),
      });
      navigate("/jobs/ready");
    } catch (error) {
      showErrorToast(error, "Failed to repeat last search");
    }
  };

  return (
    <>
      <PageFrame
        icon={JobsIcon}
        title="Job Ops"
        subtitle="Orchestrator"
        statusIndicator={
          isPipelineRunning ? (
            <StatusIndicator label="Search running" variant="amber" />
          ) : undefined
        }
        actions={
          <OrchestratorHeaderActions
            isPipelineRunning={isPipelineRunning}
            isCancelling={false}
            pipelineSources={[]}
            onOpenAutomaticRun={() =>
              navigate("/jobs/ready", { state: { jobsIntent: "find" } })
            }
            // Cancelling (with its progress) lives on the Jobs page.
            onCancelPipeline={() => navigate("/jobs/ready")}
            onRunLastSearch={() => {
              void runLastSearch();
            }}
            onOpenManualImport={() => setIsManualImportOpen(true)}
          />
        }
      >
        <JobListSwiper
          className="md:hidden"
          items={items}
          activeId="filtered"
          onSelect={(id) => navigate(`/jobs/${id}`)}
        />
        <nav
          aria-label="Job lists"
          className="hidden h-auto w-full flex-wrap items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground md:inline-flex lg:w-auto"
        >
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={`/jobs/${item.id}`}
              className={linkClass}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <EmbeddedPage hideHeading>
          <FilteredJobsPage view="jobs" />
        </EmbeddedPage>
      </PageFrame>
      <ManualImportSheet
        open={isManualImportOpen}
        onOpenChange={setIsManualImportOpen}
        onImported={async (result) => {
          navigate(`/jobs/ready/${result.jobId}`);
        }}
      />
    </>
  );
};

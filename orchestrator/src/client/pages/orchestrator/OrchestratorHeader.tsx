import { PageHeader, StatusIndicator } from "@client/components/layout";
import type { JobSource } from "@shared/types.js";
import { FileText, Loader2, Search, Square, X } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { SearchScheduleControls } from "./SearchScheduleControls";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  isCancelling: boolean;
  pipelineSources: JobSource[];
  hideRunAction?: boolean;
  isSearchComposerOpen?: boolean;
  onOpenAutomaticRun: () => void;
  onCancelPipeline: () => void;
  onOpenManualImport: () => void;
  onRunLastSearch?: () => void;
}

type OrchestratorHeaderActionsProps = Omit<
  OrchestratorHeaderProps,
  "navOpen" | "onNavOpenChange"
>;

/** Find jobs / repeat / schedule / Add a job: shared by the Jobs and Filtered pages. */
export const OrchestratorHeaderActions: React.FC<
  OrchestratorHeaderActionsProps
> = ({
  isPipelineRunning,
  isCancelling,
  pipelineSources,
  hideRunAction = false,
  isSearchComposerOpen = false,
  onOpenAutomaticRun,
  onCancelPipeline,
  onOpenManualImport,
  onRunLastSearch,
}) => {
  const primaryAction = hideRunAction ? null : isPipelineRunning ? (
    <Button
      size="sm"
      onClick={onCancelPipeline}
      disabled={isCancelling}
      variant="destructive"
      className="gap-2"
    >
      {isCancelling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Square className="h-4 w-4" />
      )}
      <span>
        {isCancelling ? `Cancelling (${pipelineSources.length})` : `Cancel run`}
      </span>
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={onOpenAutomaticRun}
      variant={isSearchComposerOpen ? "secondary" : "default"}
      className="gap-2"
      aria-pressed={isSearchComposerOpen}
    >
      {isSearchComposerOpen ? (
        <X className="h-4 w-4" />
      ) : (
        <Search className="h-4 w-4" />
      )}
      <span>{isSearchComposerOpen ? "Close search" : "Find jobs"}</span>
    </Button>
  );
  return (
    <div className="flex items-center gap-2">
      {primaryAction}
      {onRunLastSearch && !hideRunAction ? (
        <SearchScheduleControls
          isPipelineRunning={isPipelineRunning}
          onRunLastSearch={onRunLastSearch}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onOpenManualImport}
      >
        <FileText className="h-4 w-4" />
        Add a job
      </Button>
    </div>
  );
};

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  ...actionProps
}) => (
  <PageHeader
    brand
    navOpen={navOpen}
    onNavOpenChange={onNavOpenChange}
    statusIndicator={
      actionProps.isPipelineRunning ? (
        <StatusIndicator label="Search running" variant="amber" />
      ) : undefined
    }
    actions={<OrchestratorHeaderActions {...actionProps} />}
  />
);

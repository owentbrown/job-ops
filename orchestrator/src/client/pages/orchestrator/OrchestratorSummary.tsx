import { PipelineProgress } from "@client/components";
import { useWelcomeMessage } from "@client/hooks/useWelcomeMessage";
import type { JobStatus } from "@shared/types.js";
import type React from "react";

interface OrchestratorSummaryProps {
  stats: Record<JobStatus, number>;
  isPipelineRunning: boolean;
}

export const OrchestratorSummary: React.FC<OrchestratorSummaryProps> = ({
  isPipelineRunning,
}) => {
  const welcomeText = useWelcomeMessage();

  return (
    // On phones the greeting is hidden, so the section only shows during a run.
    <section
      className={isPipelineRunning ? "space-y-4" : "hidden space-y-4 md:block"}
    >
      {welcomeText ? (
        // Phones skip the greeting so the job lists start higher up.
        <div className="hidden items-center justify-between md:flex">
          <h1 className="text-lg font-medium tracking-tight">{welcomeText}</h1>
        </div>
      ) : null}

      {isPipelineRunning && (
        <div>
          <PipelineProgress isRunning={isPipelineRunning} />
        </div>
      )}
    </section>
  );
};

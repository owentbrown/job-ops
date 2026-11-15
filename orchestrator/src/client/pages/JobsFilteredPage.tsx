import { EmbeddedPage, PageFrame } from "@client/components/PageFrame";
import type React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FilteredJobsPage } from "./FilteredJobsPage";
import { jobListItems } from "./orchestrator/constants";
import { JobListSwiper } from "./orchestrator/filters/JobListSwiper";

// Mirrors the Jobs page header (OrchestratorHeader) without its run controls.
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

/** Jobs > Filtered: the same tab strip as the Jobs page, then the filtered list. */
export const JobsFilteredPage: React.FC = () => {
  const navigate = useNavigate();
  const items = jobListItems();
  return (
    <PageFrame icon={JobsIcon} title="Job Ops" subtitle="Orchestrator">
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
          <NavLink key={item.id} to={`/jobs/${item.id}`} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <EmbeddedPage hideHeading>
        <FilteredJobsPage view="jobs" />
      </EmbeddedPage>
    </PageFrame>
  );
};

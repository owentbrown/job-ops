import { EmbeddedPage, PageFrame } from "@client/components/PageFrame";
import { LayoutDashboard } from "lucide-react";
import type React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FilteredJobsPage } from "./FilteredJobsPage";
import { tabs } from "./orchestrator/constants";

// Mirrors TabsTrigger so the strip looks like the Jobs page tabs.
const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive
      ? "bg-background text-foreground shadow"
      : "text-muted-foreground hover:text-foreground",
  );

/** Jobs > Filtered: the same tab strip as the Jobs page, then the filtered list. */
export const JobsFilteredPage: React.FC = () => (
  <PageFrame
    icon={LayoutDashboard}
    title="Jobs"
    subtitle="Jobs the pre-score filter removed"
  >
    <nav
      aria-label="Job lists"
      className="inline-flex h-auto flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground"
    >
      {tabs.map((tab) => (
        <NavLink key={tab.id} to={`/jobs/${tab.id}`} className={linkClass}>
          {tab.label}
        </NavLink>
      ))}
      <NavLink to="/jobs/filtered" className={linkClass}>
        Filtered
      </NavLink>
    </nav>
    <EmbeddedPage hideHeading>
      <FilteredJobsPage view="jobs" />
    </EmbeddedPage>
  </PageFrame>
);

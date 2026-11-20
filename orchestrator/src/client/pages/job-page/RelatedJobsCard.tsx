import type { RelatedJob } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { Building2, CopyCheck } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import * as api from "@/client/api";
import { StatusBadge } from "@/client/components/StatusBadge";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";

/** Rows shown before "Show all". */
const COLLAPSED_COUNT = 5;
/** Title similarity (0-100) at which a role is called out as similar. */
const SIMILAR_TITLE_THRESHOLD = 80;

const ACTED_ON = new Set(["applied", "in_progress"]);

type RelatedJobsCardProps = {
  jobId: string;
  employer: string;
};

function describeDate(item: RelatedJob): string {
  if (item.appliedAt) return `Applied ${formatDate(item.appliedAt)}`;
  return `Found ${formatDate(item.discoveredAt)}`;
}

function summarize(items: RelatedJob[]): string {
  const applied = items.filter((item) => ACTED_ON.has(item.status)).length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const parts = [`${items.length} ${items.length === 1 ? "role" : "roles"}`];
  if (applied > 0) parts.push(`${applied} applied`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.join(" · ");
}

/**
 * "Other roles at this company": every other saved job at the same employer,
 * so you can tell at a glance whether a role is one you've already seen,
 * skipped or applied to. Renders nothing when there are none.
 */
export const RelatedJobsCard: React.FC<RelatedJobsCardProps> = ({
  jobId,
  employer,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const relatedQuery = useQuery({
    queryKey: queryKeys.jobs.related(jobId),
    queryFn: () => api.getRelatedJobs(jobId),
    enabled: Boolean(jobId),
  });

  const items = relatedQuery.data?.items ?? [];
  if (items.length === 0) return null;

  const samePosting = items.find((item) => item.samePosting);
  const similarApplied = items.find(
    (item) =>
      !item.samePosting &&
      ACTED_ON.has(item.status) &&
      item.titleSimilarity >= SIMILAR_TITLE_THRESHOLD,
  );
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <article
      className="rounded-xl border border-border/50 bg-card/75 p-4"
      aria-label="Other roles at this company"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="break-words">Other roles at {employer}</span>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {summarize(items)}
        </Badge>
      </div>

      {(samePosting || similarApplied) && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <CopyCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {samePosting ? (
              <>
                Possible duplicate: same posting as{" "}
                <Link
                  className="font-medium underline underline-offset-2"
                  to={`/job/${samePosting.id}`}
                >
                  {samePosting.title}
                </Link>{" "}
                (
                {samePosting.status === "applied" ||
                samePosting.status === "in_progress"
                  ? "you applied"
                  : samePosting.status}
                ).
              </>
            ) : (
              similarApplied && (
                <>
                  Similar to a role you applied to:{" "}
                  <Link
                    className="font-medium underline underline-offset-2"
                    to={`/job/${similarApplied.id}`}
                  >
                    {similarApplied.title}
                  </Link>
                  .
                </>
              )
            )}
          </span>
        </div>
      )}

      <ul className="mt-3 divide-y divide-border/40">
        {visible.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <Link
                to={`/job/${item.id}`}
                className={cn(
                  "block truncate text-sm font-medium hover:underline",
                  item.samePosting && "text-warning",
                )}
                title={item.title}
              >
                {item.title}
              </Link>
              <div className="text-xs text-muted-foreground">
                {describeDate(item)}
                {item.samePosting && " · same posting"}
              </div>
            </div>
            <StatusBadge status={item.status} />
          </li>
        ))}
      </ul>

      {items.length > COLLAPSED_COUNT && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </article>
  );
};

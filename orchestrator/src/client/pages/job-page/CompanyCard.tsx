import type {
  CompanyCheck,
  CompanyInfoResponse,
  CompanyReviewLink,
} from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type React from "react";
import * as api from "@/client/api";
import { showErrorToast } from "@/client/lib/error-toast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

/** A check older than this is flagged as possibly out of date. */
const STALE_AFTER_DAYS = 30;

type CompanyCardProps = {
  jobId: string;
};

function formatCount(value: number | null): string | null {
  return value === null ? null : value.toLocaleString("en-CA");
}

function formatCost(usd: number): string {
  const cents = usd * 100;
  return cents < 1 ? "<1¢" : `${Math.round(cents)}¢`;
}

function isStale(checkedAt: string): boolean {
  const ageMs = Date.now() - Date.parse(checkedAt);
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const ExternalAnchor: React.FC<{
  href: string;
  className?: string;
  children: React.ReactNode;
}> = ({ href, className, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={
      className ?? "underline underline-offset-2 hover:text-foreground"
    }
  >
    {children}
  </a>
);

const LinkRow: React.FC<{ links: CompanyReviewLink[] }> = ({ links }) => (
  <div className="flex flex-wrap gap-2">
    {links.map((link) => (
      <Button key={link.label} asChild variant="outline" size="sm">
        <a href={link.url} target="_blank" rel="noopener noreferrer">
          {link.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      </Button>
    ))}
  </div>
);

const CheckList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: string[];
}> = ({ title, icon, items }) =>
  items.length === 0 ? null : (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );

const CheckResult: React.FC<{ check: CompanyCheck }> = ({ check }) => (
  <div className="space-y-3">
    {check.summary && <p className="text-sm leading-6">{check.summary}</p>}

    {check.ratings.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {check.ratings.map((rating) => {
          const label = (
            <>
              {rating.source}
              {rating.rating !== null && (
                <span className="font-semibold">
                  {" "}
                  ★ {rating.rating.toFixed(1)}
                </span>
              )}
              {rating.reviewCount !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  ({formatCount(rating.reviewCount)})
                </span>
              )}
            </>
          );
          return (
            <Badge
              key={`${rating.source}-${rating.url ?? ""}`}
              variant="outline"
              className="text-xs font-normal"
            >
              {rating.url ? (
                <ExternalAnchor href={rating.url} className="hover:underline">
                  {label}
                </ExternalAnchor>
              ) : (
                label
              )}
            </Badge>
          );
        })}
      </div>
    )}

    <div className="grid gap-3 md:grid-cols-2">
      <CheckList
        title="Pros"
        icon={<ThumbsUp className="h-3.5 w-3.5" />}
        items={check.pros}
      />
      <CheckList
        title="Cons"
        icon={<ThumbsDown className="h-3.5 w-3.5" />}
        items={check.cons}
      />
    </div>

    {check.redFlags.length > 0 && (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
        <CheckList
          title="Red flags"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          items={check.redFlags}
        />
      </div>
    )}

    {check.sources.length > 0 && (
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Sources ({check.sources.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {check.sources.map((source) => (
            <li key={source.url} className="truncate">
              <ExternalAnchor href={source.url}>{source.label}</ExternalAnchor>
            </li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

/**
 * "About this company": the free Indeed rating and review links, plus the
 * optional AI company check (web search summary of reviews and news), which
 * costs a few cents and is cached per company.
 */
export const CompanyCard: React.FC<CompanyCardProps> = ({ jobId }) => {
  const queryClient = useQueryClient();
  const infoQuery = useQuery({
    queryKey: queryKeys.jobs.company(jobId),
    queryFn: () => api.getCompanyInfo(jobId),
    enabled: Boolean(jobId),
  });
  const check = useMutation({
    mutationFn: () => api.runCompanyCheck(jobId),
    onSuccess: (data: CompanyInfoResponse) => {
      queryClient.setQueryData(queryKeys.jobs.company(jobId), data);
    },
    onError: (error) => showErrorToast(error, "Company check failed"),
  });

  const info = infoQuery.data;
  if (!info) return null;

  const facts = [
    info.indeed?.employees && `${info.indeed.employees} employees`,
    info.indeed?.industry,
  ].filter(Boolean);
  const existing = info.check;

  return (
    <article
      className="rounded-xl border border-border/50 bg-card/75 p-4"
      aria-label="About this company"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold break-words">
          About {info.employer}
        </div>
        {info.indeed && (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Star className="h-3 w-3 fill-current" />
            {info.indeed.rating.toFixed(1)} on Indeed
            {info.indeed.reviewsCount !== null &&
              ` · ${formatCount(info.indeed.reviewsCount)} reviews`}
          </Badge>
        )}
      </div>

      {(facts.length > 0 || info.indeed?.website) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {facts.join(" · ")}
          {facts.length > 0 && info.indeed?.website && " · "}
          {info.indeed?.website && (
            <ExternalAnchor href={info.indeed.website}>
              {new URL(info.indeed.website).hostname.replace(/^www\./, "")}
            </ExternalAnchor>
          )}
        </div>
      )}

      <div className="mt-3">
        <LinkRow links={info.links} />
      </div>

      <div className="mt-4 border-t border-border/40 pt-3">
        {existing ? (
          <>
            <CheckResult check={existing} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                AI company check · {formatDate(existing.checkedAt)} ·{" "}
                {existing.searches}{" "}
                {existing.searches === 1 ? "search" : "searches"} ·{" "}
                {formatCost(existing.costUsd)}
                {isStale(existing.checkedAt) && " · may be out of date"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => check.mutate()}
                disabled={check.isPending || !!info.checkUnavailableReason}
              >
                {check.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {check.isPending ? "Checking…" : "Refresh"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {info.checkUnavailableReason ??
                "Search Glassdoor, Indeed, Reddit and the news, and summarise them. A few cents; saved for this company."}
            </p>
            <Button
              size="sm"
              onClick={() => check.mutate()}
              disabled={check.isPending || !!info.checkUnavailableReason}
            >
              {check.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {check.isPending ? "Checking… (~30s)" : "Company check"}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
};

import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDays } from "./format";

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="font-mono text-sm tabular-nums">{value}</dd>
  </div>
);

export const RepliesCard: React.FC<{
  replies: OverviewResponse["replies"];
}> = ({ replies }) => (
  <Card>
    <CardContent className="flex flex-col gap-4 pt-(--density-pad)">
      <h3 className="text-[15px] font-semibold">Replies</h3>
      <div>
        <p className="font-mono text-4xl leading-none tabular-nums">
          {replies.responseRate === null
            ? "—"
            : `${Math.round(replies.responseRate * 100)}%`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Response rate · {replies.replied} of {replies.applied} applications
        </p>
      </div>
      <dl className="divide-y divide-border/60 border-t border-border/60">
        <Row
          label="Median time to reply"
          value={formatDays(replies.medianDaysToReply)}
        />
        <Row label="Emails matched" value={String(replies.emailsMatched)} />
      </dl>
      {replies.replied === 0 ? (
        <p className="text-xs text-muted-foreground">
          Too early to read. These fill in after your first reply.
        </p>
      ) : null}
    </CardContent>
  </Card>
);

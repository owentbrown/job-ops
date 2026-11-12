import type { OverviewResponse } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDays } from "./format";

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({
  label,
  value,
  note,
}) => (
  <div className="flex-1 rounded-xl border border-border/60 p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-2 font-mono text-3xl tabular-nums">{value}</p>
    {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
  </div>
);

export const RepliesCard: React.FC<{
  replies: OverviewResponse["replies"];
}> = ({ replies }) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-4 p-6">
      <h3 className="text-sm font-semibold">Replies</h3>
      <div className="flex flex-wrap gap-3">
        <Stat
          label="Response rate"
          value={
            replies.responseRate === null
              ? "—"
              : `${Math.round(replies.responseRate * 100)}%`
          }
          note={`${replies.replied} of ${replies.applied} applications`}
        />
        <Stat
          label="Median time to reply"
          value={formatDays(replies.medianDaysToReply)}
        />
        <Stat label="Emails matched" value={String(replies.emailsMatched)} />
      </div>
      {replies.replied === 0 ? (
        <p className="text-xs text-muted-foreground">
          Too early to read. These fill in after your first reply.
        </p>
      ) : null}
    </CardContent>
  </Card>
);

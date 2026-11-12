import { isExtractorSourceId, sourceLabel } from "@shared/extractors";
import type { OverviewSourceRow } from "@shared/types.js";
import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { canShowRate, percent } from "./format";

export const SourceYieldTable: React.FC<{ rows: OverviewSourceRow[] }> = ({
  rows,
}) => {
  // A row of 0% rates before anyone has replied reads as failure, not data.
  const anyReplies = rows.some((r) => r.replied > 0);
  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="space-y-4 p-6">
        <h3 className="text-sm font-semibold">Source yield</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs found in this range.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-normal">Board</th>
                    <th className="pb-2 text-right font-normal">Results</th>
                    <th className="pb-2 text-right font-normal">Applied</th>
                    <th className="pb-2 text-right font-normal">Replied</th>
                    <th className="pb-2 text-right font-normal">Reply rate</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {rows.map((r) => (
                    <tr key={r.source} className="border-t border-border/50">
                      <td className="break-words py-2 font-sans">
                        {isExtractorSourceId(r.source)
                          ? sourceLabel(r.source)
                          : r.source}
                      </td>
                      <td className="py-2 text-right">{r.results}</td>
                      <td className="py-2 text-right">{r.applied}</td>
                      <td className="py-2 text-right">{r.replied}</td>
                      <td className="py-2 text-right">
                        {anyReplies && canShowRate(r.applied)
                          ? `${percent(r.replied, r.applied)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!anyReplies && (
              <p className="text-xs text-muted-foreground">
                Reply rates appear after your first reply.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

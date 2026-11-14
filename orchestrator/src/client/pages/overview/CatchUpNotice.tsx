import type { BackfillKind } from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { toast } from "sonner";
import * as api from "@/client/api";
import { showErrorToast } from "@/client/lib/error-toast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";

/**
 * Offers a one-off AI pass for older jobs. Nothing runs until the button is
 * clicked; the estimate itself is a database count.
 */
export const CatchUpNotice: React.FC<{ kind: BackfillKind; noun: string }> = ({
  kind,
  noun,
}) => {
  const queryClient = useQueryClient();
  const estimate = useQuery({
    queryKey: queryKeys.overview.backfill(kind),
    queryFn: () => api.getBackfillEstimate(kind),
  });
  const run = useMutation({
    mutationFn: () => api.runBackfill(kind),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.overview.all });
      const failed =
        result.failedBatches > 0 ? ", some failed. Try again later." : "";
      toast.success(`Categorized ${result.categorized}${failed}`);
    },
    onError: (error) => showErrorToast(error, "Couldn't categorize"),
  });

  const data = estimate.data;
  if (!data || data.count === 0) return null;
  const what = kind === "roles" ? "role category" : "reason category";
  const cost =
    data.estimatedCost !== null
      ? `est. $${data.estimatedCost.toFixed(2)}`
      : `${data.calls} AI call${data.calls === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <span>
        {data.count} {noun} have no {what}. <span>{cost}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={run.isPending}
        onClick={() => run.mutate()}
      >
        {run.isPending ? "Categorizing…" : "Categorize"}
      </Button>
    </div>
  );
};

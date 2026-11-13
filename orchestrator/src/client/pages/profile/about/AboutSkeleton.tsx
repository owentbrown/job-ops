import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <Card>
    <CardContent className="space-y-3 pt-(--density-pad)">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </CardContent>
  </Card>
);

/** Placeholder layout while insights load. */
export const AboutSkeleton: React.FC = () => (
  <output
    className="block space-y-4"
    aria-busy="true"
    aria-label="Loading your profile"
  >
    <Skeleton className="h-36 w-full rounded-(--radius)" />
    <SkeletonCard lines={2} />
    <SkeletonCard lines={6} />
    <div className="grid gap-4 lg:grid-cols-2">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </output>
);

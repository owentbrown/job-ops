import type React from "react";
import { Card, CardContent } from "@/components/ui/card";

export const RolesCard: React.FC = () => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-2 p-6">
      <h3 className="text-sm font-semibold">Response rate by role</h3>
      <p className="font-mono text-2xl text-muted-foreground">—</p>
      <p className="text-sm text-muted-foreground">
        Appears once applications are categorized by role.
      </p>
    </CardContent>
  </Card>
);

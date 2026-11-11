import { FlaskConical, ShieldBan } from "lucide-react";
import type React from "react";
import { toast } from "sonner";

function DemoToastCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex w-[360px] items-start gap-3 rounded-lg border border-warning/70 bg-warning p-3 text-warning-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--color-warning)_35%,transparent)]">
      <div className="mt-0.5 text-warning-foreground/90">{icon}</div>
      <div className="space-y-1">
        <p className="text-sm font-semibold leading-tight text-warning-foreground">
          {title}
        </p>
        <p className="text-xs text-warning-foreground/90">{description}</p>
      </div>
    </div>
  );
}

export function showDemoSimulatedToast(description: string): void {
  toast.custom(
    () => (
      <DemoToastCard
        title="Simulated in Demo Mode"
        description={description}
        icon={<FlaskConical className="h-4 w-4" />}
      />
    ),
    { duration: 3600 },
  );
}

export function showDemoBlockedToast(description: string): void {
  toast.custom(
    () => (
      <DemoToastCard
        title="Blocked in Public Demo"
        description={description}
        icon={<ShieldBan className="h-4 w-4" />}
      />
    ),
    { duration: 4200 },
  );
}

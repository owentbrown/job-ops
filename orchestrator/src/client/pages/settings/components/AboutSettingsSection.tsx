import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import { ExternalLink } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type AboutSettingsSectionProps = {
  version: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  layoutMode?: "accordion" | "panel";
};

export const AboutSettingsSection: React.FC<AboutSettingsSectionProps> = ({
  version,
  updateAvailable,
  latestVersion,
  layoutMode,
}) => (
  <SettingsSectionFrame mode={layoutMode} title="About JobOps" value="about">
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">Version</div>
        <p className="text-sm text-muted-foreground">{version}</p>
        {updateAvailable ? (
          <p className="text-xs text-muted-foreground">
            Update available{latestVersion ? `: ${latestVersion}` : ""}.{" "}
            <a
              href="https://github.com/DaKheera47/job-ops/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              View release notes
            </a>
          </p>
        ) : null}
      </div>
      <Separator />
      <div className="space-y-2">
        <div className="text-sm font-medium">Documentation</div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="/docs" target="_blank" rel="noopener noreferrer">
            Open documentation
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  </SettingsSectionFrame>
);

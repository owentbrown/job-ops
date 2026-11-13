import { PageFrame } from "@client/components/PageFrame";
import { useProfileInsights } from "@client/hooks/useProfileInsights";
import { RESUME_STUDIO_BASE } from "@client/lib/routes";
import { UserRound } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AboutSkeleton } from "./about/AboutSkeleton";
import { BrandBanner } from "./about/BrandBanner";
import { BrandSheet } from "./about/BrandSheet";
import { DocumentsBanner } from "./about/DocumentsBanner";
import { LandingCard } from "./about/LandingCard";
import { PitchCard } from "./about/PitchCard";
import { PitchSheet } from "./about/PitchSheet";
import type { AboutPanel } from "./about/parts";
import { RolesCard } from "./about/RolesCard";
import { SkillMapCard } from "./about/SkillMapCard";
import { SkillsSheet } from "./about/SkillsSheet";
import { StoryBankCard } from "./about/StoryBankCard";
import { StorySheet } from "./about/StorySheet";
import { StrengthSheet } from "./about/StrengthSheet";
import { ValuesCard } from "./about/ValuesCard";
import { ValuesSheet } from "./about/ValuesSheet";

const NoResumeCard: React.FC = () => (
  <Card>
    <CardContent className="space-y-2 pt-(--density-pad)">
      <p className="text-sm">Your profile is built from your resume.</p>
      <Link
        to={RESUME_STUDIO_BASE}
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        Import your resume in Document Studio
      </Link>
    </CardContent>
  </Card>
);

export const AboutYouPage: React.FC = () => {
  const insights = useProfileInsights();
  const navigate = useNavigate();
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<AboutPanel | null>(null);

  const onEdit = (panel: AboutPanel) => {
    setStrengthOpen(false);
    if (panel.kind === "edit-resume") {
      navigate(RESUME_STUDIO_BASE);
      return;
    }
    setOpenPanel(panel);
  };

  const panelProps = (kind: AboutPanel["kind"]) => ({
    open: openPanel?.kind === kind,
    onOpenChange: (open: boolean) => {
      if (!open) setOpenPanel(null);
    },
  });

  const data = insights.data;

  return (
    <PageFrame
      icon={UserRound}
      title="About you"
      subtitle="Who you are and what you're aiming for"
    >
      <div className="space-y-4">
        {insights.isLoading ? (
          <AboutSkeleton />
        ) : !data ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-(--density-pad)">
              <p className="text-sm">We couldn't load your profile.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void insights.refetch()}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {data.dataState === "no-resume" ? (
              <NoResumeCard />
            ) : (
              <BrandBanner
                brand={data.brand}
                strength={data.strength}
                bestFitJobCount={data.bestFitJobCount}
                onEdit={onEdit}
                onOpenStrength={() => setStrengthOpen(true)}
              />
            )}
            <div
              data-testid="pitch-skills-row"
              className="grid gap-4 lg:grid-cols-2 lg:items-stretch"
            >
              <PitchCard pitch={data.pitch} onEdit={onEdit} />
              <SkillMapCard
                dataState={data.dataState}
                skills={data.skills}
                bestFitJobCount={data.bestFitJobCount}
                refreshedAt={data.skillsRefreshedAt}
                onEdit={onEdit}
              />
            </div>
            <RolesCard dataState={data.dataState} roles={data.roles} />
            <div className="grid gap-4 lg:grid-cols-2">
              <StoryBankCard stories={data.stories} onEdit={onEdit} />
              <ValuesCard values={data.values} onEdit={onEdit} />
            </div>
            <LandingCard landing={data.landing} />
            <StrengthSheet
              open={strengthOpen}
              onOpenChange={setStrengthOpen}
              strength={data.strength}
              onEdit={onEdit}
            />
            {openPanel?.kind === "edit-brand" ? (
              <BrandSheet
                {...panelProps("edit-brand")}
                targetRoles={data.brand.targetRoles}
                fallbackLine={
                  data.brand.lineSource === "headline" ? data.brand.line : null
                }
              />
            ) : null}
            {openPanel?.kind === "edit-pitch" ? (
              <PitchSheet
                {...panelProps("edit-pitch")}
                autoWrite={"autoWrite" in openPanel && openPanel.autoWrite}
              />
            ) : null}
            {openPanel?.kind === "add-story" ? (
              <StorySheet {...panelProps("add-story")} />
            ) : null}
            {openPanel?.kind === "edit-story" ? (
              <StorySheet
                {...panelProps("edit-story")}
                storyId={openPanel.storyId}
              />
            ) : null}
            {openPanel?.kind === "edit-values" ? (
              <ValuesSheet {...panelProps("edit-values")} />
            ) : null}
            {openPanel?.kind === "edit-skills" ? (
              <SkillsSheet {...panelProps("edit-skills")} />
            ) : null}
          </>
        )}
        <DocumentsBanner />
      </div>
    </PageFrame>
  );
};

import { PageFrame } from "@client/components/PageFrame";
import {
  useProfileInsights,
  useProfileMutations,
} from "@client/hooks/useProfileInsights";
import { RESUME_STUDIO_BASE } from "@client/lib/routes";
import { UserRound } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AboutSkeleton } from "./about/AboutSkeleton";
import { BrandBanner } from "./about/BrandBanner";
import { DocumentsBanner } from "./about/DocumentsBanner";
import { LandingCard } from "./about/LandingCard";
import { PitchCard } from "./about/PitchCard";
import type { AboutPanel } from "./about/parts";
import { RolesCard } from "./about/RolesCard";
import { SkillMapCard } from "./about/SkillMapCard";
import { StoryBankCard } from "./about/StoryBankCard";
import { StrengthSheet } from "./about/StrengthSheet";
import { ValuesCard } from "./about/ValuesCard";

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
  const { refreshSkills } = useProfileMutations();
  const navigate = useNavigate();
  const [strengthOpen, setStrengthOpen] = useState(false);
  // Edit panels arrive in the next step; the page already tracks which one
  // is asked for.
  const [openPanel, setOpenPanel] = useState<AboutPanel | null>(null);

  const onEdit = (panel: AboutPanel) => {
    setStrengthOpen(false);
    if (panel.kind === "edit-resume") {
      navigate(RESUME_STUDIO_BASE);
      return;
    }
    setOpenPanel(panel);
  };

  const onRefreshSkills = () => {
    refreshSkills.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          `Skills refreshed from ${result.jobsUsed} jobs: ${result.added} new, ${result.updated} updated`,
        );
      },
      onError: (error) => {
        showErrorToast(error, "Skill refresh failed");
      },
    });
  };

  const data = insights.data;

  return (
    <PageFrame
      icon={UserRound}
      title="About you"
      subtitle="Who you are and what you're aiming for"
    >
      <div
        className="space-y-4"
        data-open-panel={openPanel ? openPanel.kind : undefined}
      >
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
            <PitchCard pitch={data.pitch} onEdit={onEdit} />
            <SkillMapCard
              dataState={data.dataState}
              skills={data.skills}
              bestFitJobCount={data.bestFitJobCount}
              refreshedAt={data.skillsRefreshedAt}
              onEdit={onEdit}
              onRefresh={onRefreshSkills}
              refreshing={refreshSkills.isPending}
            />
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
          </>
        )}
        <DocumentsBanner />
      </div>
    </PageFrame>
  );
};

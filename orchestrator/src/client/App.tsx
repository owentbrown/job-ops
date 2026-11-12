/**
 * Main App component.
 */

import { X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { CSSTransition, SwitchTransition } from "react-transition-group";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { OnboardingGate } from "./components/OnboardingGate";
import { useAnalyticsIdentity } from "./hooks/useAnalyticsIdentity";
import { useDemoInfo } from "./hooks/useDemoInfo";
import { setAuthNavigator } from "./lib/auth-navigation";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ClassicOverviewPage } from "./pages/ClassicOverviewPage";
import { GmailOauthCallbackPage } from "./pages/GmailOauthCallbackPage";
import { JobPage } from "./pages/JobPage";
import { JobsFilteredPage } from "./pages/JobsFilteredPage";
import { OfflinePage } from "./pages/OfflinePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OrchestratorPage } from "./pages/OrchestratorPage";
import { OverviewPage } from "./pages/OverviewPage";
import { AboutYouPage } from "./pages/profile/AboutYouPage";
import { ProfileStudioPage } from "./pages/profile/ProfileStudioPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { SsoCallbackPage } from "./pages/SsoCallbackPage";

/** Backwards-compatibility redirects: old URL paths -> new URL paths */
const REDIRECTS: Array<{ from: string; to: string }> = [
  { from: "/", to: "/jobs/ready" },
  { from: "/home", to: "/overview" },
  { from: "/ready", to: "/jobs/ready" },
  { from: "/ready/:jobId", to: "/jobs/ready/:jobId" },
  { from: "/filtered", to: "/jobs/filtered" },
  { from: "/discovered", to: "/jobs/discovered" },
  { from: "/discovered/:jobId", to: "/jobs/discovered/:jobId" },
  { from: "/applied", to: "/jobs/applied" },
  { from: "/applied/:jobId", to: "/jobs/applied/:jobId" },
  { from: "/in-progress", to: "/applications/board" },
  { from: "/in-progress/:jobId", to: "/applications/board" },
  { from: "/jobs/in_progress", to: "/applications/board" },
  { from: "/jobs/in_progress/:jobId", to: "/applications/board" },
  { from: "/applications", to: "/applications/board" },
  { from: "/applications/in-progress", to: "/applications/board" },
  { from: "/tracking-inbox", to: "/applications/inbox" },
  { from: "/all", to: "/jobs/all" },
  { from: "/all/:jobId", to: "/jobs/all/:jobId" },
  { from: "/watchlist", to: "/settings#sources" },
  { from: "/visa-sponsors", to: "/settings#visa-sponsors" },
  { from: "/spend", to: "/settings#spend" },
  { from: "/tracer-links", to: "/settings#tracer-links" },
  { from: "/design-resume", to: "/profile/studio/resume" },
  { from: "/design-resume/:section", to: "/profile/studio/resume/:section" },
  { from: "/profile/studio", to: "/profile/studio/resume" },
];

/** Redirect that substitutes `:param` placeholders in `to` from the matched route. */
function ParamRedirect({ to }: { to: string }) {
  const params = useParams();
  const target = to.replace(
    /:([A-Za-z]+)/g,
    (_, key: string) => params[key] ?? "",
  );
  return <Navigate to={target} replace />;
}

const DEMO_WAITLIST_BANNER_DISMISSED_KEY = "jobops.demoWaitlistBannerDismissed";

export const App: React.FC = () => {
  useAnalyticsIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const nodeRef = useRef<HTMLDivElement>(null);
  const isAuthRoute =
    location.pathname === "/sign-in" ||
    location.pathname.startsWith("/sso/callback/");
  const demoInfo = useDemoInfo({ enabled: !isAuthRoute });
  const showDemoBanners = !isAuthRoute && demoInfo?.demoMode;
  const [demoWaitlistBannerDismissed, setDemoWaitlistBannerDismissed] =
    useState(() => {
      try {
        return localStorage.getItem(DEMO_WAITLIST_BANNER_DISMISSED_KEY) === "1";
      } catch {
        return false;
      }
    });

  // Determine a stable key for transitions to avoid unnecessary unmounts when switching sub-tabs
  const pageKey = React.useMemo(() => {
    const firstSegment = location.pathname.split("/")[1] || "jobs";
    if (firstSegment === "jobs") {
      return "orchestrator";
    }
    return firstSegment;
  }, [location.pathname]);

  useEffect(() => {
    setAuthNavigator((nextPath) => {
      const search = new URLSearchParams();
      if (
        nextPath &&
        nextPath !== "/sign-in" &&
        !nextPath.startsWith("/sign-in?")
      ) {
        search.set("next", nextPath);
      }
      navigate(`/sign-in${search.toString() ? `?${search.toString()}` : ""}`, {
        replace: true,
      });
    });

    return () => {
      setAuthNavigator(null);
    };
  }, [navigate]);

  return (
    <>
      <OnboardingGate />
      {showDemoBanners && (
        <div className="sticky top-0 z-50 w-full border-b border-warning/50 bg-warning/20 px-4 py-2 text-xs text-warning shadow-sm backdrop-blur">
          <div className="mx-auto flex items-center justify-center gap-3">
            <p className="flex-1 text-center">
              <span className="font-medium">
                Demo mode: integrations are simulated and data resets every{" "}
                {demoInfo.resetCadenceHours} hours.
              </span>
              {!demoWaitlistBannerDismissed && (
                <>
                  {" "}
                  This is a read-only demo. Want JobOps without the Docker
                  setup?{" "}
                  <a
                    className="font-semibold underline underline-offset-2 hover:text-foreground"
                    href="https://try.jobops.app?utm_source=demo&utm_medium=banner&utm_campaign=waitlist"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join the waitlist.
                  </a>
                </>
              )}
            </p>
            {!demoWaitlistBannerDismissed && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full text-warning hover:bg-warning/20 hover:text-foreground"
                onClick={() => {
                  setDemoWaitlistBannerDismissed(true);
                  try {
                    localStorage.setItem(
                      DEMO_WAITLIST_BANNER_DISMISSED_KEY,
                      "1",
                    );
                  } catch {
                    // Ignore storage errors in restricted browser contexts.
                  }
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Dismiss demo waitlist banner</span>
              </Button>
            )}
          </div>
        </div>
      )}
      <div>
        <SwitchTransition mode="out-in">
          <CSSTransition
            key={pageKey}
            nodeRef={nodeRef}
            timeout={100}
            classNames="page"
            unmountOnExit
          >
            <div ref={nodeRef}>
              <Routes location={location}>
                {/* Backwards-compatibility redirects */}
                {REDIRECTS.map(({ from, to }) => (
                  <Route
                    key={from}
                    path={from}
                    element={<ParamRedirect to={to} />}
                  />
                ))}

                {/* Application routes */}
                <Route path="/overview" element={<OverviewPage />} />
                <Route
                  path="/overview/classic"
                  element={<ClassicOverviewPage />}
                />
                <Route
                  path="/oauth/gmail/callback"
                  element={<GmailOauthCallbackPage />}
                />
                <Route path="/job/:id" element={<JobPage />} />
                <Route path="/job/:id/:view" element={<JobPage />} />
                <Route
                  path="/applications/:tab"
                  element={<ApplicationsPage />}
                />
                <Route path="/profile" element={<AboutYouPage />} />
                <Route
                  path="/profile/studio/:doc"
                  element={<ProfileStudioPage />}
                />
                <Route
                  path="/profile/studio/:doc/:section"
                  element={<ProfileStudioPage />}
                />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/offline" element={<OfflinePage />} />
                <Route path="/sign-in" element={<SignInPage />} />
                <Route
                  path="/sso/callback/:provider"
                  element={<SsoCallbackPage />}
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/jobs/filtered" element={<JobsFilteredPage />} />
                <Route path="/jobs/:tab" element={<OrchestratorPage />} />
                <Route
                  path="/jobs/:tab/:jobId"
                  element={<OrchestratorPage />}
                />
              </Routes>
            </div>
          </CSSTransition>
        </SwitchTransition>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};

import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppModeContext } from "./components/layout";
import { useDemoInfo } from "./hooks/useDemoInfo";

vi.mock("./hooks/useDemoInfo", () => ({
  useDemoInfo: vi.fn(),
}));

vi.mock("react-transition-group", () => ({
  SwitchTransition: ({ children }: { children: React.ReactNode }) => children,
  CSSTransition: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("./components/OnboardingGate", () => ({
  OnboardingGate: () => null,
}));

vi.mock("./pages/GmailOauthCallbackPage", () => ({
  GmailOauthCallbackPage: () => null,
}));

vi.mock("./pages/ClassicOverviewPage", () => ({
  ClassicOverviewPage: () => <div>overview</div>,
}));

vi.mock("./pages/OverviewPage", () => ({
  OverviewPage: () => <div>overview</div>,
}));

vi.mock("./pages/ApplicationsPage", () => ({
  ApplicationsPage: () => <div>applications</div>,
}));

vi.mock("./pages/JobPage", () => ({
  JobPage: () => null,
}));

vi.mock("./pages/OnboardingPage", () => ({
  OnboardingPage: () => <div>onboarding</div>,
}));

vi.mock("./pages/OrchestratorPage", () => ({
  OrchestratorPage: () => {
    const { tab, jobId } = useParams();
    return <div>{`orchestrator:${tab}:${jobId ?? ""}`}</div>;
  },
}));

vi.mock("./pages/profile/AboutYouPage", () => ({
  AboutYouPage: () => <div>about-you</div>,
}));

vi.mock("./pages/SettingsPage", async () => {
  const { useLocation } = await import("react-router-dom");
  return {
    SettingsPage: () => {
      const location = useLocation();
      return <div>settings{location.hash}</div>;
    },
  };
});

vi.mock("./pages/profile/ProfileStudioPage", () => ({
  ProfileStudioPage: () => {
    const { section } = useParams();
    return <div>design-resume-page{section ? `:${section}` : ""}</div>;
  },
}));

vi.mock("./pages/SignInPage", () => ({
  SignInPage: () => <div>sign-in</div>,
}));

vi.mock("./pages/JobsFilteredPage", () => ({
  JobsFilteredPage: () => <div>jobs-filtered</div>,
}));

describe("App demo banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a waitlist link in demo mode", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: true,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Join the waitlist." });
    expect(link).toHaveAttribute(
      "href",
      "https://try.jobops.app?utm_source=demo&utm_medium=banner&utm_campaign=waitlist",
    );
  });

  it("does not render the demo banner waitlist link when demo mode is disabled", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "try.jobops.app" })).toBeNull();
  });

  it("does not fetch demo info while rendering the sign-in page", () => {
    vi.mocked(useDemoInfo).mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("sign-in")).toBeInTheDocument();
    expect(useDemoInfo).toHaveBeenCalledWith({ enabled: false });
  });

  it("lets the user dismiss the waitlist banner and keeps it hidden", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: true,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss demo waitlist banner/i }),
    );

    expect(screen.queryByRole("link", { name: "try.jobops.app" })).toBeNull();
    expect(localStorage.getItem("jobops.demoWaitlistBannerDismissed")).toBe(
      "1",
    );
  });

  it("renders the neutral Resume Studio route", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/profile/studio/resume"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("design-resume-page")).toBeInTheDocument();
  });

  it.each([
    ["/design-resume", "design-resume-page"],
    ["/design-resume/basics", "design-resume-page:basics"],
    ["/profile/studio", "design-resume-page"],
  ])("redirects %s to the Resume Studio, keeping the section", (path, text) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("sends hosted users hitting /tracking-inbox to Applications", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <AppModeContext.Provider value={{ appMode: "hosted", isPending: false }}>
        <MemoryRouter initialEntries={["/tracking-inbox"]}>
          <App />
        </MemoryRouter>
      </AppModeContext.Provider>,
    );

    expect(screen.getByText("applications")).toBeInTheDocument();
  });

  it.each([
    "/tracking-inbox",
    "/applications/in-progress",
    "/in-progress",
    "/applications",
  ])("%s lands on Applications", async (from) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });
    render(
      <MemoryRouter initialEntries={[from]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("applications")).toBeInTheDocument();
  });
});

describe("legacy URLs moved into Settings", () => {
  it.each([
    ["/watchlist", "settings#sources"],
    ["/visa-sponsors", "settings#visa-sponsors"],
    ["/spend", "settings#spend"],
    ["/tracer-links", "settings#tracer-links"],
  ])("%s redirects to %s", async (from, text) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });
    render(
      <MemoryRouter initialEntries={[from]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});

describe("Filtered jobs tab", () => {
  it.each([
    "/filtered",
    "/jobs/filtered",
  ])("%s shows the Jobs Filtered tab", async (from) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });
    render(
      <MemoryRouter initialEntries={[from]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("jobs-filtered")).toBeInTheDocument();
  });
});

describe("parameterised legacy redirects", () => {
  it("substitutes :jobId when redirecting /ready/abc", async () => {
    vi.mocked(useDemoInfo).mockReturnValue(null);
    render(
      <MemoryRouter initialEntries={["/ready/abc"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("orchestrator:ready:abc"),
    ).toBeInTheDocument();
  });
});

describe("About you route", () => {
  it("renders at /profile", async () => {
    vi.mocked(useDemoInfo).mockReturnValue(null);
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("about-you")).toBeInTheDocument();
  });
});

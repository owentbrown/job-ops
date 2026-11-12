# Nav Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the JobOps sidebar from 11 items to 5 (Overview, Jobs, Applications, Profile, Settings) by re-housing existing pages, with a redirect for every old URL.

**Architecture:** A new `PageFrame` component replaces each moved page's `PageHeader` + `PageMain` pair. Inside an `EmbeddedPage` context it draws a compact section header instead, so Settings, Applications and Profile can host existing pages unchanged. Routing changes live in `App.tsx` (`REDIRECTS` + routes) and the nav list in `components/navigation.ts`. No server or database changes.

**Tech Stack:** React 18, React Router 6, TanStack Query 5, Tailwind + shadcn/ui (`@/components/ui/*`), lucide-react, Vitest + Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-11-11-nav-consolidation-design.md`

---

## Ground rules for whoever executes this

- **Commits:** Owen's rule is to commit only when he asks. Each "Commit" step means *stage, show the diff summary, and commit once Owen has OK'd committing for this plan*. Work on a branch off `my-changes` (e.g. `nav-consolidation`).
- **Never touch the live database.** For manual checks, use a dev server on a DB copy: stop the `job-ops` container, copy the `job-ops_jobops-db` volume's `jobs.db` *and* `jobs.db-wal` with a throwaway container, then `docker start job-ops`. Point `DATA_DIR` at the copy (see `orchestrator` dev notes). Never stop the container while a pipeline run is in progress.
- **Commands** (run from repo root):
  - one test file: `npm --prefix orchestrator run test:run -- src/client/<path>`
  - types: `npm run check:types`
  - lint/format: `npm --prefix orchestrator run check`
- **Known unrelated failures:** two date-dependent tests in `src/client/components/charts/ApplicationsPerDayChart.test.tsx`. Ignore them.
- Paths below are relative to `orchestrator/src/client/` unless they start with `docs/` or `shared/`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `components/PageFrame.tsx` | create | `PageFrame`, `EmbeddedPage`, `useIsEmbedded` |
| `components/PageFrame.test.tsx` | create | standalone vs embedded rendering |
| `pages/WatchlistPage.tsx`, `VisaSponsorsPage.tsx`, `SpendPage.tsx`, `TracerLinksPage.tsx`, `FilteredJobsPage.tsx`, `TrackingInboxPage.tsx`, `InProgressBoardPage.tsx` | modify | swap header/main for `PageFrame` |
| `pages/FilteredJobsPage.tsx` | modify | `view` prop: `"all" \| "jobs" \| "rules"` |
| `pages/SettingsPage.tsx` | modify | Search group, Spend, embedded sections, tracer analytics |
| `pages/JobsFilteredPage.tsx` | create | `/jobs/filtered`: Jobs header + tab links + Filtered list |
| `pages/orchestrator/filters/OrchestratorTabRow.tsx` | modify | "Filtered" link after the tabs |
| `pages/ApplicationsPage.tsx` (+ test) | create | `/applications/:tab` with Board / Inbox |
| `components/SignatureCard.tsx` | create | signature upload/preview/remove, extracted |
| `pages/job-page/CoverLetterPanel.tsx` | modify | use `SignatureCard` |
| `lib/routes.ts` | create | `RESUME_STUDIO_BASE` and other route constants |
| `pages/profile/ProfileStudioPage.tsx` | create | Document Studio shell, Resume / Cover letter control |
| `pages/profile/CoverLetterStudio.tsx` | create | voice card + signature + note |
| `pages/profile/AboutYouPage.tsx` (+ test) | create | read-only profile summary |
| `pages/DesignResumePage.tsx`, `hooks/useDesignResumeStudio.ts`, `components/OnboardingGate.tsx`, `pages/OnboardingPage.tsx` | modify | resume base path |
| `components/navigation.ts` (+ new test), `components/layout.tsx` | modify | 5 items, Profile sub-items |
| `App.tsx`, `App.test.tsx` | modify | routes, redirects, tests |
| `pages/orchestrator/AutomaticSourcePickerCard.tsx`, `pages/orchestrator/JobDetailPanel.tsx` | modify | update links |

---

# Step 1: Foundations (no visible change)

### Task 1: `PageFrame` and `EmbeddedPage`

**Files:**
- Create: `components/PageFrame.tsx`
- Test: `components/PageFrame.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/PageFrame.test.tsx
import { render, screen } from "@testing-library/react";
import { Eye } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { EmbeddedPage, PageFrame } from "./PageFrame";

vi.mock("./layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>app-header:{title}</header>,
  PageMain: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <main className={className}>{children}</main>
  ),
}));

describe("PageFrame", () => {
  it("renders the app page header and main when standalone", () => {
    render(
      <PageFrame icon={Eye} title="Watchlist" subtitle="Career pages" mainClassName="space-y-4">
        <p>body</p>
      </PageFrame>,
    );
    expect(screen.getByText("app-header:Watchlist")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("space-y-4");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders a section heading and no main when embedded", () => {
    render(
      <EmbeddedPage>
        <PageFrame
          icon={Eye}
          title="Watchlist"
          subtitle="Career pages"
          badge="3"
          actions={<button type="button">Run</button>}
        >
          <p>body</p>
        </PageFrame>
      </EmbeddedPage>,
    );
    expect(screen.queryByText(/app-header/)).toBeNull();
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: /Watchlist/ })).toBeInTheDocument();
    expect(screen.getByText("Career pages")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("can hide the embedded heading when the host already shows one", () => {
    render(
      <EmbeddedPage hideHeading>
        <PageFrame icon={Eye} title="Watchlist" subtitle="Career pages" actions={<button type="button">Run</button>}>
          <p>body</p>
        </PageFrame>
      </EmbeddedPage>,
    );
    expect(screen.queryByRole("heading", { name: /Watchlist/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm --prefix orchestrator run test:run -- src/client/components/PageFrame.test.tsx`
Expected: FAIL, `Failed to resolve import "./PageFrame"`.

- [ ] **Step 3: Implement**

```tsx
// components/PageFrame.tsx
import type { LucideIcon } from "lucide-react";
import type React from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, PageMain } from "./layout";

type EmbeddedState = { embedded: boolean; hideHeading: boolean };
const EmbeddedContext = createContext<EmbeddedState>({ embedded: false, hideHeading: false });

/** Wrap a page component to render it as a section inside another page. */
export const EmbeddedPage: React.FC<{ children: React.ReactNode; hideHeading?: boolean }> = ({
  children,
  hideHeading = false,
}) => (
  <EmbeddedContext.Provider value={{ embedded: true, hideHeading }}>{children}</EmbeddedContext.Provider>
);

export const useIsEmbedded = () => useContext(EmbeddedContext).embedded;

type PageFrameProps = {
  icon: LucideIcon | React.FC<{ className?: string }>;
  title: string;
  subtitle: string;
  badge?: string;
  statusIndicator?: React.ReactNode;
  actions?: React.ReactNode;
  mainClassName?: string;
  children: React.ReactNode;
};

/**
 * Standalone: the app header plus <main>, exactly as PageHeader + PageMain.
 * Embedded: a compact section heading and a plain <div>.
 */
export const PageFrame: React.FC<PageFrameProps> = ({
  icon,
  title,
  subtitle,
  badge,
  statusIndicator,
  actions,
  mainClassName,
  children,
}) => {
  const { embedded, hideHeading } = useContext(EmbeddedContext);

  if (!embedded) {
    return (
      <>
        <PageHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          badge={badge}
          statusIndicator={statusIndicator}
          actions={actions}
        />
        <PageMain className={mainClassName}>{children}</PageMain>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {hideHeading && !actions && !statusIndicator ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {hideHeading ? (
            <div>{statusIndicator}</div>
          ) : (
            <div className="min-w-0 space-y-1">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {title}
                {badge ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                    {badge}
                  </span>
                ) : null}
                {statusIndicator}
              </h2>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          )}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={cn("space-y-6", mainClassName)}>{children}</div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm --prefix orchestrator run test:run -- src/client/components/PageFrame.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/client/components/PageFrame.tsx orchestrator/src/client/components/PageFrame.test.tsx
git commit -m "feat(ui): add PageFrame so pages can render embedded in other pages"
```

### Task 2: Convert the seven pages to `PageFrame`

**Files (modify):** `pages/WatchlistPage.tsx`, `pages/VisaSponsorsPage.tsx`, `pages/SpendPage.tsx`, `pages/TracerLinksPage.tsx`, `pages/FilteredJobsPage.tsx`, `pages/TrackingInboxPage.tsx`, `pages/InProgressBoardPage.tsx`

The transformation is the same in every file. In each **return** that renders `<PageHeader …/>` followed by `<PageMain …>…</PageMain>`:

1. Replace `<PageHeader` with `<PageFrame` and keep every prop it had (`icon`, `title`, `subtitle`, `badge`, `statusIndicator`, `actions`).
2. If `PageMain` had a `className`, move it onto `PageFrame` as `mainClassName`.
3. Remove the `/>` that closed `PageHeader` and the `<PageMain …>` opening tag. Put a `>` at the end of the `PageFrame` props, and change `</PageMain>` to `</PageFrame>`.
4. Remove the now-redundant `<>…</>` fragment if `PageFrame` is its only child.
5. In the import line, remove `PageHeader`/`PageMain` if unused and add `import { PageFrame } from "@client/components/PageFrame";`.

Worked example, `WatchlistPage.tsx` lines 586-…:

```tsx
// before
  return (
    <>
      <PageHeader
        icon={Eye}
        title="Watchlist"
        subtitle="Career pages you're watching"
      />

      <PageMain>
        <div className="space-y-3">
          …
      </PageMain>
    </>
  );

// after
  return (
    <PageFrame
      icon={Eye}
      title="Watchlist"
      subtitle="Career pages you're watching"
    >
      <div className="space-y-3">
        …
    </PageFrame>
  );
```

`InProgressBoardPage` keeps its full-height layout:

```tsx
<PageFrame
  icon={Columns3}
  /* …other header props unchanged… */
  mainClassName="flex h-[calc(100dvh-5rem)] max-w-[1600px] flex-col"
>
```

`TrackingInboxPage` gets `mainClassName="space-y-4"`. `DesignResumePage` is **not** converted. It is embedded differently in Task 9.

Some pages have an early-return branch, e.g. a loading state that renders its own `PageHeader`. Convert those branches the same way.

- [ ] **Step 1: Convert `WatchlistPage.tsx` as shown**
- [ ] **Step 2: Convert `VisaSponsorsPage.tsx`, `SpendPage.tsx`, `TracerLinksPage.tsx`, `FilteredJobsPage.tsx`**
- [ ] **Step 3: Convert `TrackingInboxPage.tsx` and `InProgressBoardPage.tsx`**
- [ ] **Step 4: Confirm nothing still imports `PageHeader` in those seven files**

Run: `grep -l "PageHeader" orchestrator/src/client/pages/{Watchlist,VisaSponsors,Spend,TracerLinks,FilteredJobs,TrackingInbox,InProgressBoard}Page.tsx`
Expected: no output.

- [ ] **Step 5: Run those pages' existing tests**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/WatchlistPage.test.tsx src/client/pages/VisaSponsorsPage.test.tsx src/client/pages/TracerLinksPage.test.tsx src/client/pages/FilteredJobsPage.test.tsx src/client/pages/TrackingInboxPage.test.tsx src/client/pages/InProgressBoardPage.test.tsx`
Expected: all pass, unchanged. The standalone output is identical.

- [ ] **Step 6: Types and lint**

Run: `npm run check:types && npm --prefix orchestrator run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add orchestrator/src/client/pages
git commit -m "refactor(ui): render moved pages through PageFrame"
```

### Task 3: `FilteredJobsPage` gets a `view` prop

The page has two inner tabs, "Filtered jobs" and "Rules". Jobs › Filtered shows only the list; Settings › Pre-score filter shows only the rules.

**Files:**
- Modify: `pages/FilteredJobsPage.tsx`
- Test: `pages/FilteredJobsPage.test.tsx`

- [ ] **Step 1: Add failing tests** (append inside the existing `describe`, reusing that file's existing api mocks and render helper)

```tsx
it("shows only the list and a link to the rules when view is jobs", async () => {
  renderPage(<FilteredJobsPage view="jobs" />);
  expect(await screen.findByText(/Filtered jobs/)).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Rules" })).toBeNull();
  expect(screen.getByRole("link", { name: /Edit filter rules/ })).toHaveAttribute(
    "href",
    "/settings#prefilter",
  );
});

it("shows only the rules editor when view is rules", async () => {
  renderPage(<FilteredJobsPage view="rules" />);
  expect(screen.queryByRole("tab", { name: /Filtered jobs/ })).toBeNull();
  expect(await screen.findByTestId("prefilter-rules-editor")).toBeInTheDocument();
});
```

If the file has no `renderPage` helper, use the render call the existing tests use, wrapped in `<MemoryRouter>`. If `PrefilterRulesEditor` is mocked in that file, give the mock `data-testid="prefilter-rules-editor"`. Otherwise add `data-testid="prefilter-rules-editor"` to the root element of `pages/filtered/PrefilterRulesEditor.tsx`.

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/FilteredJobsPage.test.tsx`
Expected: the 2 new tests FAIL; the old ones pass.

- [ ] **Step 3: Implement**

Change the signature and the body under `PageFrame`:

```tsx
import { Link } from "react-router-dom";

type FilteredView = "all" | "jobs" | "rules";

export const FilteredJobsPage: React.FC<{ view?: FilteredView }> = ({ view = "all" }) => {
```

Then wrap the existing inner `<Tabs defaultValue="filtered">…</Tabs>`:

```tsx
{view === "all" ? (
  <Tabs defaultValue="filtered">
    {/* existing TabsList + both TabsContent blocks, unchanged */}
  </Tabs>
) : view === "jobs" ? (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Filtered jobs ({jobs.length})</h3>
      <Link to="/settings#prefilter" className="text-sm text-primary hover:underline">
        Edit filter rules in Settings
      </Link>
    </div>
    {/* the JSX that was inside <TabsContent value="filtered"> */}
  </div>
) : (
  /* the JSX that was inside <TabsContent value="rules"> */
)}
```

To avoid copying JSX, first lift the two `TabsContent` bodies into local constants above the `return`, and use them in all three branches:

```tsx
const filteredList = ( /* former TabsContent value="filtered" children */ );
const rulesEditor = ( /* former TabsContent value="rules" children */ );
```

When `view === "jobs"`, pass `actions={undefined}`, because the backlog button belongs with the rules. Pass the subtitle as `view === "jobs" ? "Jobs the pre-score filter removed" : "Pre-score filter: what it removed, and the rules it uses"`.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/FilteredJobsPage.test.tsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/client/pages/FilteredJobsPage.tsx orchestrator/src/client/pages/FilteredJobsPage.test.tsx orchestrator/src/client/pages/filtered/PrefilterRulesEditor.tsx
git commit -m "feat(filtered): allow showing only the list or only the rules"
```

---

# Step 2: Settings absorbs Sources, Pre-score filter, Visa, Spend, Tracer analytics

### Task 4: New Settings sections

**Files:**
- Modify: `pages/SettingsPage.tsx` (types ~131-153, `SETTINGS_NAV_GROUPS` ~168, `SECTION_FIELD_MAP` ~317, `getSectionBadge` ~1590, the section `switch` ~1643)
- Test: `pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests** (append to `SettingsPage.test.tsx`; add the mocks at the top of the file next to the other `vi.mock` calls)

```tsx
vi.mock("./WatchlistPage", () => ({ WatchlistPage: () => <div>watchlist-body</div> }));
vi.mock("./VisaSponsorsPage", () => ({ VisaSponsorsPage: () => <div>visa-body</div> }));
vi.mock("./SpendPage", () => ({ SpendPage: () => <div>spend-body</div> }));
vi.mock("./TracerLinksPage", () => ({ TracerLinksPage: () => <div>tracer-analytics-body</div> }));
vi.mock("./FilteredJobsPage", () => ({
  FilteredJobsPage: ({ view }: { view?: string }) => <div>filtered-body:{view}</div>,
}));
```

```tsx
describe("absorbed sections", () => {
  it.each([
    ["#sources", "watchlist-body"],
    ["#prefilter", "filtered-body:rules"],
    ["#visa-sponsors", "visa-body"],
    ["#spend", "spend-body"],
  ])("opens %s from the URL hash", async (hash, text) => {
    render(
      <MemoryRouter initialEntries={[`/settings${hash}`]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("shows tracer analytics under the tracer links setup", async () => {
    render(
      <MemoryRouter initialEntries={["/settings#tracer-links"]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("tracer-analytics-body")).toBeInTheDocument();
  });

  it("lists the new Search group in the settings nav", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Pre-score filter")).toBeInTheDocument();
    expect(screen.getByText("Visa sponsors")).toBeInTheDocument();
    expect(screen.getByText("Spend")).toBeInTheDocument();
  });
});
```

Use the same `beforeEach` setup the file's other tests use (`getSettings` resolving `createAppSettings()` etc.). If groups render collapsed, open the "Search" group with `fireEvent.click(screen.getByText("Search"))` before the `getByText` checks, as the file's other nav tests do.

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/SettingsPage.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 3: Extend the ids**

```tsx
type SettingsSectionId =
  | "billing" | "model" | "chat" | "prompt-templates" | "spend"
  | "sources" | "prefilter" | "scoring" | "visa-sponsors"
  | "reactive-resume" | "webhooks" | "tracer-links"
  | "environment" | "display" | "backup" | "danger-zone";

type SettingsGroupId =
  | "account" | "ai" | "search" | "integrations"
  | "workspaces" | "display" | "backups" | "danger";
```

(The old `"scoring"` *group* id goes away; the `"scoring"` *section* id stays.)

- [ ] **Step 4: Update `SETTINGS_NAV_GROUPS`**

In the `ai` group, append after `prompt-templates`:

```tsx
{
  id: "spend",
  label: "Spend",
  description: "Estimated AI cost per run and per task, and model pricing.",
  searchTerms: ["cost", "spend", "tokens", "pricing", "budget"],
},
```

Replace the whole `{ id: "scoring", label: "Scoring", items: [...] }` group with:

```tsx
{
  id: "search",
  label: "Search",
  items: [
    {
      id: "sources",
      label: "Sources",
      description: "Company career pages you watch for new roles.",
      searchTerms: ["watchlist", "career pages", "sources", "companies"],
    },
    {
      id: "prefilter",
      label: "Pre-score filter",
      description: "Rules that remove jobs before AI scoring, and the backlog run.",
      searchTerms: ["filter", "filtered", "rules", "prefilter", "exclude"],
    },
    {
      id: "scoring",
      label: "Scoring rules",
      description: "Salary penalties, thresholds, keywords, and scorer hints.",
      searchTerms: ["threshold", "salary", "keywords", "instructions"],
    },
    {
      id: "visa-sponsors",
      label: "Visa sponsors",
      description: "Look up companies in the visa sponsor registers.",
      searchTerms: ["visa", "sponsor", "sponsorship"],
    },
  ],
},
```

- [ ] **Step 5: `SECTION_FIELD_MAP`**: add the new non-form sections

```tsx
spend: [],
sources: [],
prefilter: [],
"visa-sponsors": [],
```

- [ ] **Step 6: `getSectionBadge`**: add before `default:`

```tsx
case "spend":
case "sources":
case "prefilter":
case "visa-sponsors":
  return null;
```

- [ ] **Step 7: Render the sections.** Add the imports:

```tsx
import { EmbeddedPage } from "@client/components/PageFrame";
import { FilteredJobsPage } from "./FilteredJobsPage";
import { SpendPage } from "./SpendPage";
import { TracerLinksPage } from "./TracerLinksPage";
import { VisaSponsorsPage } from "./VisaSponsorsPage";
import { WatchlistPage } from "./WatchlistPage";
```

In the `switch (activeSection)`, add:

```tsx
case "spend":
  activeSectionContent = (
    <EmbeddedPage hideHeading>
      <SpendPage />
    </EmbeddedPage>
  );
  break;
case "sources":
  activeSectionContent = (
    <EmbeddedPage hideHeading>
      <WatchlistPage />
    </EmbeddedPage>
  );
  break;
case "prefilter":
  activeSectionContent = (
    <EmbeddedPage hideHeading>
      <FilteredJobsPage view="rules" />
    </EmbeddedPage>
  );
  break;
case "visa-sponsors":
  activeSectionContent = (
    <EmbeddedPage hideHeading>
      <VisaSponsorsPage />
    </EmbeddedPage>
  );
  break;
```

And change the existing `"tracer-links"` case to:

```tsx
case "tracer-links":
  activeSectionContent = (
    <div className="space-y-8">
      <TracerLinksSettingsSection
        readiness={tracerReadiness}
        isLoading={isLoading || isTracerReadinessLoading}
        isChecking={isTracerReadinessChecking}
        onVerifyNow={handleVerifyTracerReadiness}
        layoutMode="panel"
      />
      <EmbeddedPage>
        <TracerLinksPage />
      </EmbeddedPage>
    </div>
  );
  break;
```

`hideHeading` is used because the Settings panel already shows the section label and description. The page's action buttons still render.

- [ ] **Step 8: Hide the save bar for non-form sections.** Find where the save/discard footer renders (search for `activeSectionIsDirty` or `dirtySectionCount` in the JSX). If it renders unconditionally, wrap it:

```tsx
{SECTION_FIELD_MAP[activeSection].length > 0 ? (/* existing save footer */) : null}
```

If the billing section already hides it through another condition, extend that condition instead.

- [ ] **Step 9: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/SettingsPage.test.tsx`
Expected: all pass, old and new.

- [ ] **Step 10: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client/pages/SettingsPage.tsx orchestrator/src/client/pages/SettingsPage.test.tsx
git commit -m "feat(settings): host Sources, Pre-score filter, Visa sponsors, Spend and tracer analytics"
```

### Task 5: Redirects, nav items and links for step 2

**Files:**
- Modify: `App.tsx` (`REDIRECTS` ~42, routes ~205-214), `components/navigation.ts`, `pages/orchestrator/AutomaticSourcePickerCard.tsx:243`
- Test: `App.test.tsx`

- [ ] **Step 1: Failing tests in `App.test.tsx`.** `SettingsPage` is mocked as `() => null`. Change that mock so it shows the location:

```tsx
vi.mock("./pages/SettingsPage", async () => {
  const { useLocation } = await import("react-router-dom");
  return {
    SettingsPage: () => {
      const location = useLocation();
      return <div>settings{location.hash}</div>;
    },
  };
});
```

Add:

```tsx
describe("legacy URLs moved into Settings", () => {
  it.each([
    ["/watchlist", "settings#sources"],
    ["/visa-sponsors", "settings#visa-sponsors"],
    ["/spend", "settings#spend"],
    ["/tracer-links", "settings#tracer-links"],
  ])("%s redirects to %s", async (from, text) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false, resetCadenceHours: 6, lastResetAt: null,
      nextResetAt: null, baselineVersion: null, baselineName: null,
    });
    render(
      <MemoryRouter initialEntries={[from]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx`
Expected: the 4 new tests FAIL.

- [ ] **Step 3: Add the redirects and remove the routes.** In `REDIRECTS` append:

```tsx
{ from: "/watchlist", to: "/settings#sources" },
{ from: "/visa-sponsors", to: "/settings#visa-sponsors" },
{ from: "/spend", to: "/settings#spend" },
{ from: "/tracer-links", to: "/settings#tracer-links" },
```

Delete these `<Route>` lines: `/tracer-links`, `/visa-sponsors`, `/watchlist`, `/spend`. Then delete the now-unused imports of `TracerLinksPage`, `VisaSponsorsPage`, `WatchlistPage` and `SpendPage` from `App.tsx`, along with any matching `vi.mock` blocks in `App.test.tsx` that only existed for those routes.

- [ ] **Step 4: Remove four nav items.** In `components/navigation.ts`, delete the `Tracer Links`, `Visa Sponsors`, `Watchlist` and `Spend` entries, plus their now-unused icon imports (`Link2`, `Shield`, `Eye`, `CircleDollarSign`).

- [ ] **Step 5: Update the in-app link.** In `pages/orchestrator/AutomaticSourcePickerCard.tsx` change `href="/watchlist"` to `href="/settings#sources"`.

- [ ] **Step 6: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx src/client/pages/orchestrator`
Expected: pass.

- [ ] **Step 7: Manual check** on a dev server with a DB copy (see Ground rules):
  - Visit `/watchlist`, `/spend`, `/visa-sponsors` and `/tracer-links`. Each should land on the right Settings section.
  - Save a filter rule from Settings › Pre-score filter.
  - Confirm the Settings save bar doesn't appear on these sections.

- [ ] **Step 8: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client
git commit -m "feat(nav): move Watchlist, Visa, Spend and Tracer Links into Settings"
```

---

# Step 3: Jobs › Filtered

### Task 6: `/jobs/filtered`

**Files:**
- Create: `pages/JobsFilteredPage.tsx`
- Modify: `pages/orchestrator/filters/OrchestratorTabRow.tsx`, `App.tsx`, `components/navigation.ts`
- Test: `App.test.tsx`

- [ ] **Step 1: Failing test.** In `App.test.tsx` add a mock and tests:

```tsx
vi.mock("./pages/JobsFilteredPage", () => ({
  JobsFilteredPage: () => <div>jobs-filtered</div>,
}));
```

```tsx
it.each(["/filtered", "/jobs/filtered"])("%s shows the Jobs Filtered tab", async (from) => {
  vi.mocked(useDemoInfo).mockReturnValue({
    demoMode: false, resetCadenceHours: 6, lastResetAt: null,
    nextResetAt: null, baselineVersion: null, baselineName: null,
  });
  render(
    <MemoryRouter initialEntries={[from]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("jobs-filtered")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm failure.**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create the page**

```tsx
// pages/JobsFilteredPage.tsx
import { EmbeddedPage, PageFrame } from "@client/components/PageFrame";
import { LayoutDashboard } from "lucide-react";
import type React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { tabs } from "./orchestrator/constants";
import { FilteredJobsPage } from "./FilteredJobsPage";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

/** Jobs › Filtered: the same tab strip as the Jobs page, then the filtered list. */
export const JobsFilteredPage: React.FC = () => (
  <PageFrame icon={LayoutDashboard} title="Jobs" subtitle="Jobs the pre-score filter removed">
    <nav aria-label="Job lists" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <NavLink key={tab.id} to={`/jobs/${tab.id}`} className={linkClass}>
          {tab.label}
        </NavLink>
      ))}
      <NavLink to="/jobs/filtered" className={linkClass}>
        Filtered
      </NavLink>
    </nav>
    <EmbeddedPage hideHeading>
      <FilteredJobsPage view="jobs" />
    </EmbeddedPage>
  </PageFrame>
);
```

- [ ] **Step 4: Add the "Filtered" link to the Jobs tab row.** In `pages/orchestrator/filters/OrchestratorTabRow.tsx`, add `import { Link } from "react-router-dom";`, then add directly after the closing `</TabsList>`:

```tsx
<Link
  to="/jobs/filtered"
  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
>
  Filtered
</Link>
```

Then wrap `TabsList` and this link together in `<div className="flex flex-wrap items-center gap-1">…</div>` so they sit on one line.

- [ ] **Step 5: Routes.** In `App.tsx`:
  - Add `{ from: "/filtered", to: "/jobs/filtered" }` to `REDIRECTS`.
  - Delete the `<Route path="/filtered" …>` and the `FilteredJobsPage` import.
  - Add `<Route path="/jobs/filtered" element={<JobsFilteredPage />} />` **above** the `/jobs/:tab` route. React Router ranks static segments first anyway; the order just makes it obvious.
  - Import `JobsFilteredPage`.
  - Remove the `vi.mock("./pages/FilteredJobsPage"…)` from `App.test.tsx` if it exists.

- [ ] **Step 6: Nav.** In `components/navigation.ts`:
  - Delete the `Filtered` entry and the `Filter` icon import.
  - Add `"/jobs/filtered"` to the Jobs entry's `activePaths`.

- [ ] **Step 7: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx src/client/pages/orchestrator src/client/pages/FilteredJobsPage.test.tsx`
Expected: pass.

- [ ] **Step 8: Manual check** on the DB copy:
  - The Jobs tab row shows Filtered.
  - Clicking it shows the removed jobs, and clicking Ready goes back.
  - The "Edit filter rules in Settings" link opens Settings › Pre-score filter.
  - Restoring a job still works.

- [ ] **Step 9: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client
git commit -m "feat(nav): Filtered becomes a Jobs tab"
```

---

# Step 4: Applications

### Task 7: Applications page with Board and Inbox

**Files:**
- Create: `pages/ApplicationsPage.tsx`, `pages/ApplicationsPage.test.tsx`
- Modify: `App.tsx`, `components/navigation.ts`, `components/layout.tsx:119-122`, `pages/orchestrator/useOrchestratorNavigation.ts:55-57`, `pages/orchestrator/JobDetailPanel.tsx:217` (+ the navigate call that uses that label)
- Test: `App.test.tsx`

- [ ] **Step 1: Failing page test**

```tsx
// pages/ApplicationsPage.test.tsx
import { AppModeContext } from "@client/components/layout";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "./ApplicationsPage";

vi.mock("./InProgressBoardPage", () => ({ InProgressBoardPage: () => <div>board-body</div> }));
vi.mock("./TrackingInboxPage", () => ({ TrackingInboxPage: () => <div>inbox-body</div> }));

const renderAt = (path: string, appMode: "local" | "hosted" = "local") =>
  render(
    <AppModeContext.Provider value={{ appMode, isPending: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/applications/:tab" element={<ApplicationsPage />} />
        </Routes>
      </MemoryRouter>
    </AppModeContext.Provider>,
  );

describe("ApplicationsPage", () => {
  it("shows the board tab", () => {
    renderAt("/applications/board");
    expect(screen.getByText("board-body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/applications/inbox");
  });

  it("shows the inbox tab", () => {
    renderAt("/applications/inbox");
    expect(screen.getByText("inbox-body")).toBeInTheDocument();
  });

  it("hides the inbox in hosted mode", () => {
    renderAt("/applications/inbox", "hosted");
    expect(screen.queryByText("inbox-body")).toBeNull();
    expect(screen.queryByRole("link", { name: "Inbox" })).toBeNull();
    expect(screen.getByText("board-body")).toBeInTheDocument();
  });
});
```

(Check that `AppModeContext` is exported from `components/layout.tsx`. `App.test.tsx` already imports it, so use the same import path that file uses.)

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/ApplicationsPage.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// pages/ApplicationsPage.tsx
import { AppModeContext } from "@client/components/layout";
import { EmbeddedPage, PageFrame } from "@client/components/PageFrame";
import { Columns3 } from "lucide-react";
import React from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { InProgressBoardPage } from "./InProgressBoardPage";
import { TrackingInboxPage } from "./TrackingInboxPage";

type AppTab = "board" | "inbox";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

export const ApplicationsPage: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const { appMode, isPending } = React.useContext(AppModeContext);
  const inboxAllowed = appMode !== "hosted";

  if (isPending) return null;
  if (tab !== "board" && tab !== "inbox") return <Navigate to="/applications/board" replace />;
  if (tab === "inbox" && !inboxAllowed) return <Navigate to="/applications/board" replace />;

  const active: AppTab = tab;

  return (
    <PageFrame
      icon={Columns3}
      title="Applications"
      subtitle="Everything after you apply"
    >
      {/* The board sets its own full-height layout through its PageFrame mainClassName. Don't repeat it here. */}
      {inboxAllowed ? (
        <nav aria-label="Applications views" className="inline-flex gap-1 self-start rounded-lg bg-muted p-1">
          <NavLink to="/applications/board" className={linkClass}>Board</NavLink>
          <NavLink to="/applications/inbox" className={linkClass}>Inbox</NavLink>
        </nav>
      ) : null}
      <EmbeddedPage hideHeading>
        {active === "board" ? <InProgressBoardPage /> : <TrackingInboxPage />}
      </EmbeddedPage>
    </PageFrame>
  );
};
```

- [ ] **Step 4: Run the page test and confirm it passes.**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/ApplicationsPage.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: App routes, redirects and tests.** In `App.tsx`:
  - Replace the `/applications/in-progress` and `/tracking-inbox` `<Route>`s with `<Route path="/applications/:tab" element={<ApplicationsPage />} />`.
  - Delete the `TrackingInboxRoute` function. Hosted handling now lives in `ApplicationsPage`.
  - Change the four existing `REDIRECTS` targets `"/applications/in-progress"` to `"/applications/board"`.
  - Append:

```tsx
{ from: "/applications", to: "/applications/board" },
{ from: "/applications/in-progress", to: "/applications/board" },
{ from: "/tracking-inbox", to: "/applications/inbox" },
```

Because `/applications/in-progress` would also match `/applications/:tab`, `ApplicationsPage` treats any unknown tab as `board` via its `Navigate`. The explicit redirect keeps the URL tidy.

In `App.test.tsx`:
  - Replace the `InProgressBoardPage` mock with `vi.mock("./pages/ApplicationsPage", () => ({ ApplicationsPage: () => <div>applications</div> }))`.
  - Update the old "redirects hosted users away from Tracking Inbox" test to expect `"applications"`. The hosted check is now covered by `ApplicationsPage.test.tsx`.
  - Add:

```tsx
it.each(["/tracking-inbox", "/applications/in-progress", "/in-progress", "/applications"])(
  "%s lands on Applications",
  async (from) => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false, resetCadenceHours: 6, lastResetAt: null,
      nextResetAt: null, baselineVersion: null, baselineName: null,
    });
    render(<MemoryRouter initialEntries={[from]}><App /></MemoryRouter>);
    expect(await screen.findByText("applications")).toBeInTheDocument();
  },
);
```

- [ ] **Step 6: Nav.** In `components/navigation.ts`:
  - Replace the `In Progress` and `Tracking Inbox` entries with:

```tsx
{
  to: "/applications/board",
  label: "Applications",
  icon: Columns3,
  activePaths: ["/applications"],
},
```

  - Remove the `Inbox` icon import.
  - In `components/layout.tsx` simplify `navLinks` to `const navLinks = NAV_LINKS;`. Hosted mode no longer has a nav item to hide, and `ApplicationsPage` hides the Inbox tab.
  - Keep `appMode` only if it's still used elsewhere in that component; otherwise remove it.

- [ ] **Step 7: Internal links.**
  - `pages/orchestrator/useOrchestratorNavigation.ts:56`: `navigate("/applications/in-progress", …)` → `navigate("/applications/board", …)`.
  - `pages/orchestrator/JobDetailPanel.tsx:217`: change the label to `"View on Applications board"`.
  - Search for any `"/applications/in-progress"` string left in `src/client` with `grep -rn "applications/in-progress" orchestrator/src/client` and point each at `/applications/board`, except the redirect entry.

- [ ] **Step 8: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx src/client/pages/ApplicationsPage.test.tsx src/client/pages/InProgressBoardPage.test.tsx src/client/pages/TrackingInboxPage.test.tsx src/client/pages/orchestrator`
Expected: pass. Update any assertion in `JobDetailPanel.test.tsx` that checks the old "View in Progress Board" text.

- [ ] **Step 9: Manual check** on the DB copy:
  - The Board drags cards as before and fills the height.
  - The Inbox loads and matches emails.
  - `/tracking-inbox` lands on the Inbox.
  - The sidebar now shows: Overview, Jobs, Applications, Resume Studio, Settings.

- [ ] **Step 10: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client
git commit -m "feat(nav): Applications page with Board and Inbox tabs"
```

---

# Step 5: Profile

### Task 8: Extract `SignatureCard`

**Files:**
- Create: `components/SignatureCard.tsx`
- Modify: `pages/job-page/CoverLetterPanel.tsx` (signature state, query, effects, handlers and JSX)

- [ ] **Step 1: Read `CoverLetterPanel.tsx` end to end** and list everything signature-related:
  - `SIGNATURE_KEY` and `readFileAsBase64`
  - `signatureInputRef` and `signatureUrl` state
  - the `signature` query and the blob-URL effect
  - the upload/remove mutations or handlers
  - the signature JSX block

- [ ] **Step 2: Move them into `components/SignatureCard.tsx`** as a self-contained component:

```tsx
// components/SignatureCard.tsx
// Moved verbatim from CoverLetterPanel: SIGNATURE_KEY, readFileAsBase64,
// the signature query, blob-URL effect, upload/remove handlers and the JSX block.
export const SIGNATURE_KEY = ["cover-letter", "signature"] as const;

export const SignatureCard: React.FC<{ className?: string }> = ({ className }) => {
  // …moved state, query, effects, handlers…
  return <div className={className}>{/* …moved signature JSX… */}</div>;
};
```

Every identifier and API call stays exactly as it was. Only its location changes.

- [ ] **Step 3: Use it in the panel.** In `CoverLetterPanel.tsx` delete the moved code and render `<SignatureCard />` where the JSX block was. Keep `readFileAsBase64` in the panel only if the panel still uses it for something else.

- [ ] **Step 4: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/JobPage.test.tsx src/client/pages/job-page`
Expected: pass. The UI is unchanged.

- [ ] **Step 5: Commit**

```bash
git add orchestrator/src/client/components/SignatureCard.tsx orchestrator/src/client/pages/job-page/CoverLetterPanel.tsx
git commit -m "refactor(cover-letter): extract SignatureCard"
```

### Task 9: Document Studio (`/profile/studio/:doc`)

**Files:**
- Create: `lib/routes.ts`, `pages/profile/ProfileStudioPage.tsx`, `pages/profile/CoverLetterStudio.tsx`, `pages/profile/ProfileStudioPage.test.tsx`
- Modify: `pages/DesignResumePage.tsx:109,377-378,450-451`, `hooks/useDesignResumeStudio.ts:582`, `components/OnboardingGate.tsx:90`, `pages/OnboardingPage.tsx:899`, `App.tsx`, `App.test.tsx`, `components/OnboardingGate.test.tsx`, `pages/OnboardingPage.test.tsx:395`

- [ ] **Step 1: Route constants**

```ts
// lib/routes.ts
export const PROFILE_BASE = "/profile";
export const RESUME_STUDIO_BASE = "/profile/studio/resume";
export const COVER_LETTER_STUDIO = "/profile/studio/cover-letter";
export const resumeSectionPath = (sectionId?: string | null) =>
  sectionId ? `${RESUME_STUDIO_BASE}/${sectionId}` : RESUME_STUDIO_BASE;
```

- [ ] **Step 2: Repoint the Resume Studio links.**
  - `DesignResumePage.tsx:109` → `<Navigate to={RESUME_STUDIO_BASE} replace />`.
  - Lines 374-379 and 447-452 → `navigate(resumeSectionPath(sectionId))`.
  - `useDesignResumeStudio.ts:582` → `navigate(resumeSectionPath(sectionId));`.
  - `OnboardingGate.tsx:90`: allow both the old and new paths:

```ts
(pathname === "/design-resume" || pathname.startsWith("/design-resume/") ||
 pathname === RESUME_STUDIO_BASE || pathname.startsWith(`${RESUME_STUDIO_BASE}/`))
```

  - `OnboardingPage.tsx:899` → `<a href={RESUME_STUDIO_BASE}>`, and update `OnboardingPage.test.tsx:395` to expect `"/profile/studio/resume"`.
  - Import the constants from `@client/lib/routes` in each file.

- [ ] **Step 3: Failing studio test**

```tsx
// pages/profile/ProfileStudioPage.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProfileStudioPage } from "./ProfileStudioPage";

vi.mock("../DesignResumePage", () => ({ DesignResumePage: () => <div>resume-studio</div> }));
vi.mock("./CoverLetterStudio", () => ({ CoverLetterStudio: () => <div>cover-letter-studio</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/studio/:doc" element={<ProfileStudioPage />} />
        <Route path="/profile/studio/:doc/:section" element={<ProfileStudioPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("ProfileStudioPage", () => {
  it("shows the resume editor with the switch", () => {
    renderAt("/profile/studio/resume");
    expect(screen.getByText("resume-studio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cover letter" })).toHaveAttribute(
      "href",
      "/profile/studio/cover-letter",
    );
  });

  it("keeps a resume section in the URL", () => {
    renderAt("/profile/studio/resume/basics");
    expect(screen.getByText("resume-studio")).toBeInTheDocument();
  });

  it("shows the cover letter studio", () => {
    renderAt("/profile/studio/cover-letter");
    expect(screen.getByText("cover-letter-studio")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/profile/ProfileStudioPage.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Implement the studio shell**

`DesignResumePage` renders its own `PageHeader` and full-width editor, so it is shown as-is beneath a slim switch bar rather than wrapped in `PageFrame`. `useDesignResumeStudio` reads `useParams().section`, which the `/profile/studio/:doc/:section` route provides.

```tsx
// pages/profile/ProfileStudioPage.tsx
import { COVER_LETTER_STUDIO, RESUME_STUDIO_BASE } from "@client/lib/routes";
import { FileText, Mail } from "lucide-react";
import type React from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DesignResumePage } from "../DesignResumePage";
import { CoverLetterStudio } from "./CoverLetterStudio";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

const StudioSwitch: React.FC = () => (
  <div className="container mx-auto px-4 pt-4">
    <nav aria-label="Document type" className="inline-flex gap-1 rounded-lg bg-muted p-1">
      <NavLink to={RESUME_STUDIO_BASE} className={linkClass}>
        <FileText className="h-4 w-4" aria-hidden="true" />
        Resume
      </NavLink>
      <NavLink to={COVER_LETTER_STUDIO} className={linkClass}>
        <Mail className="h-4 w-4" aria-hidden="true" />
        Cover letter
      </NavLink>
    </nav>
  </div>
);

export const ProfileStudioPage: React.FC = () => {
  const { doc } = useParams<{ doc: string }>();
  if (doc !== "resume" && doc !== "cover-letter") return <Navigate to={RESUME_STUDIO_BASE} replace />;

  return doc === "resume" ? (
    <>
      <DesignResumePage />
      <StudioSwitch />
    </>
  ) : (
    <CoverLetterStudio switcher={<StudioSwitch />} />
  );
};
```

The switch renders *after* `DesignResumePage` in the DOM because that page's `PageHeader` is the sticky top bar. If it looks wrong in the manual check, move `<StudioSwitch />` into `DesignResumePage` through an optional `toolbar` prop, rendered as the first child of its `PageMain`.

- [ ] **Step 6: Implement the cover letter studio**

```tsx
// pages/profile/CoverLetterStudio.tsx
import { AppModeContext } from "@client/components/layout";
import { PageFrame } from "@client/components/PageFrame";
import { SignatureCard } from "@client/components/SignatureCard";
import { useSettings } from "@client/hooks/useSettings";
import { Mail } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

export const CoverLetterStudio: React.FC<{ switcher: React.ReactNode }> = ({ switcher }) => {
  const { settings, isLoading } = useSettings();
  const { appMode } = React.useContext(AppModeContext);
  const tone = settings?.chatStyleTone?.value || "Not set";
  const formality = settings?.chatStyleFormality?.value || "Not set";
  const doNotUse = settings?.chatStyleDoNotUse?.value || "Nothing yet";

  return (
    <PageFrame icon={Mail} title="Document Studio" subtitle="The base documents every application starts from">
      {switcher}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Your voice</h2>
            <p className="text-sm text-muted-foreground">
              Used for all AI writing: cover letters, chat and tailoring.
            </p>
          </div>
          <Link to="/settings#chat" className="text-sm text-primary hover:underline">
            Edit voice
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Tone</dt><dd className="font-medium">{tone}</dd></div>
            <div><dt className="text-muted-foreground">Formality</dt><dd className="font-medium">{formality}</dd></div>
            <div><dt className="text-muted-foreground">Never say</dt><dd className="font-medium">{doNotUse}</dd></div>
          </dl>
        )}
      </section>
      {appMode !== "hosted" ? (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">Signature</h2>
          <SignatureCard />
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Letters are written per job. Open a job and use its Cover letter tab.
      </p>
    </PageFrame>
  );
};
```

In `ProfileStudioPage`, the `StudioSwitch` adds container padding. For the cover-letter branch, pass a variant without the outer `container` div: give `StudioSwitch` a `bare?: boolean` prop and skip the wrapper when it's true.

- [ ] **Step 7: Routes and redirects.** In `App.tsx`:
  - Replace the two `/design-resume` routes with:

```tsx
<Route path="/profile/studio/:doc" element={<ProfileStudioPage />} />
<Route path="/profile/studio/:doc/:section" element={<ProfileStudioPage />} />
```

  - Add to `REDIRECTS`:

```tsx
{ from: "/design-resume", to: "/profile/studio/resume" },
{ from: "/design-resume/:section", to: "/profile/studio/resume/:section" },
{ from: "/profile/studio", to: "/profile/studio/resume" },
```

  - Check how `REDIRECTS` maps `:param` today (e.g. `/ready/:jobId` → `/jobs/ready/:jobId`). If `<Navigate to>` is given a literal `:jobId`, there's already a helper that substitutes params. Reuse it. If there isn't one, add a tiny component:

```tsx
function ParamRedirect({ to }: { to: string }) {
  const params = useParams();
  const target = to.replace(/:([A-Za-z]+)/g, (_, key: string) => params[key] ?? "");
  return <Navigate to={target} replace />;
}
```

    and use `element={<ParamRedirect to={to} />}` in the `REDIRECTS.map`.

  - Update `App.test.tsx`:
    - Change the "renders the neutral Resume Studio route" test to start at `/profile/studio/resume`, with `vi.mock("./pages/profile/ProfileStudioPage", () => ({ ProfileStudioPage: () => <div>design-resume-page</div> }))` replacing the `DesignResumePage` mock.
    - Add `it.each(["/design-resume", "/design-resume/basics"])` expecting `"design-resume-page"`.

- [ ] **Step 8: Update `OnboardingGate.test.tsx`** to add a case for `/profile/studio/resume` alongside the existing `/design-resume` one (same expectations).

- [ ] **Step 9: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/App.test.tsx src/client/pages/profile src/client/components/OnboardingGate.test.tsx src/client/pages/OnboardingPage.test.tsx src/client/hooks/useDesignResumeStudio.test.tsx`
Expected: pass. In `useDesignResumeStudio.test.tsx`, update any expectation of `"/design-resume/…"` to `"/profile/studio/resume/…"`.

- [ ] **Step 10: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client
git commit -m "feat(profile): Document Studio with Resume and Cover letter"
```

### Task 10: About you and the final sidebar

**Files:**
- Create: `pages/profile/AboutYouPage.tsx`, `pages/profile/AboutYouPage.test.tsx`, `components/navigation.test.ts`
- Modify: `components/navigation.ts`, `components/layout.tsx` (nav render ~165-180), `App.tsx`, `App.test.tsx`

- [ ] **Step 1: Failing nav test**

```ts
// components/navigation.test.ts
import { describe, expect, it } from "vitest";
import { isNavActive, NAV_LINKS } from "./navigation";

describe("NAV_LINKS", () => {
  it("has five top-level items in order", () => {
    expect(NAV_LINKS.map((l) => l.label)).toEqual([
      "Overview",
      "Jobs",
      "Applications",
      "Profile",
      "Settings",
    ]);
  });

  it("gives Profile two sub-items", () => {
    const profile = NAV_LINKS.find((l) => l.label === "Profile");
    expect(profile?.children?.map((c) => [c.label, c.to])).toEqual([
      ["About you", "/profile"],
      ["Document Studio", "/profile/studio/resume"],
    ]);
  });

  it.each([
    ["/profile", "/profile", ["/profile"], true],
    ["/profile/studio/resume/basics", "/profile", ["/profile"], true],
    ["/applications/inbox", "/applications/board", ["/applications"], true],
    ["/jobs/filtered", "/jobs/ready", ["/jobs/ready", "/jobs/filtered"], true],
    ["/settings", "/profile", ["/profile"], false],
  ])("isNavActive(%s, %s)", (pathname, to, activePaths, expected) => {
    expect(isNavActive(pathname, to, activePaths)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/components/navigation.test.ts`
Expected: FAIL. There are still 5 items with "Resume Studio" and no `children`.

- [ ] **Step 3: Update `navigation.ts`**

```ts
export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
  children?: Array<{ to: string; label: string; activePaths?: string[] }>;
};
```

Replace the `Resume Studio` entry with:

```ts
{
  to: "/profile",
  label: "Profile",
  icon: UserRound,
  activePaths: ["/profile"],
  children: [
    { to: "/profile", label: "About you" },
    { to: "/profile/studio/resume", label: "Document Studio", activePaths: ["/profile/studio"] },
  ],
},
```

Import `UserRound` from `lucide-react` and remove `FilePenLine`.

`isNavActive` already handles prefixes (`pathname.startsWith(path + "/")`), so it needs no change.

The final order is Overview, Jobs, Applications, Profile, Settings.

- [ ] **Step 4: Render the sub-items in the sidebar.** In `components/layout.tsx`, replace the `navLinks.map(...)` block with:

```tsx
{navLinks.map(({ to, label, icon: NavIcon, activePaths, children }) => (
  <div key={to} className="flex flex-col gap-1">
    <button
      type="button"
      onClick={() => handleNavClick(children?.[0]?.to ?? to, activePaths)}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
        isNavActive(location.pathname, to, activePaths)
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground",
      )}
    >
      <NavIcon className="h-4 w-4" />
      {label}
    </button>
    {children && isNavActive(location.pathname, to, activePaths)
      ? children.map((child) => {
          const childActive =
            child.to === "/profile"
              ? location.pathname === "/profile"
              : isNavActive(location.pathname, child.to, child.activePaths);
          return (
            <button
              key={child.to}
              type="button"
              onClick={() => handleNavClick(child.to, child.activePaths)}
              className={cn(
                "ml-7 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                childActive ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {child.label}
            </button>
          );
        })
      : null}
  </div>
))}
```

The sub-items appear only while you're inside Profile, which keeps the closed sidebar at 5 lines.

- [ ] **Step 5: Failing About you test**

```tsx
// pages/profile/AboutYouPage.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignResume } from "../../hooks/useDesignResume";
import { useSettings } from "../../hooks/useSettings";
import { AboutYouPage } from "./AboutYouPage";

vi.mock("../../hooks/useDesignResume", () => ({ useDesignResume: vi.fn() }));
vi.mock("../../hooks/useSettings", () => ({ useSettings: vi.fn() }));
vi.mock("@client/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
  PageMain: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const resume = {
  resumeJson: {
    basics: { name: "Sample Person", headline: "Strategy lead", location: "Kitchener, ON" },
    summary: { content: "<p>Turns <strong>fuzzy</strong> problems into plans.</p>" },
    sections: {
      skills: {
        items: [
          { id: "a", hidden: false, name: "Business cases" },
          { id: "b", hidden: true, name: "Hidden skill" },
        ],
      },
    },
  },
};

describe("AboutYouPage", () => {
  beforeEach(() => {
    vi.mocked(useSettings).mockReturnValue({
      settings: { searchTerms: { value: ["Product Manager", "Product Strategy"] } },
      isLoading: false,
    } as never);
  });

  it("shows headline, summary text, visible strengths and target roles", () => {
    vi.mocked(useDesignResume).mockReturnValue({ document: resume, isLoading: false } as never);
    render(<MemoryRouter><AboutYouPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Strategy lead" })).toBeInTheDocument();
    expect(screen.getByText("Turns fuzzy problems into plans.")).toBeInTheDocument();
    expect(screen.getByText("Business cases")).toBeInTheDocument();
    expect(screen.queryByText("Hidden skill")).toBeNull();
    expect(screen.getByText("Product Manager")).toBeInTheDocument();
    expect(screen.getByText("Kitchener, ON")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open resume" })).toHaveAttribute("href", "/profile/studio/resume");
  });

  it("points to Document Studio when there is no resume", () => {
    vi.mocked(useDesignResume).mockReturnValue({ document: null, isLoading: false } as never);
    render(<MemoryRouter><AboutYouPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Import your resume/ })).toHaveAttribute(
      "href",
      "/profile/studio/resume",
    );
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npm --prefix orchestrator run test:run -- src/client/pages/profile/AboutYouPage.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement**

```tsx
// pages/profile/AboutYouPage.tsx
import { PageFrame } from "@client/components/PageFrame";
import { useDesignResume } from "@client/hooks/useDesignResume";
import { useSettings } from "@client/hooks/useSettings";
import { COVER_LETTER_STUDIO, RESUME_STUDIO_BASE } from "@client/lib/routes";
import { UserRound } from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";

/** Resume summaries are stored as HTML; show them as plain text. */
const htmlToText = (html: string): string => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="rounded-full bg-muted px-3 py-1 text-sm">{children}</li>
);

export const AboutYouPage: React.FC = () => {
  const { document, isLoading } = useDesignResume();
  const { settings } = useSettings();
  const json = document?.resumeJson;
  const basics = json?.basics;
  const headline = basics?.headline || basics?.name || "Your profile";
  const summary = htmlToText(json?.summary?.content ?? "");
  const strengths = (json?.sections?.skills?.items ?? [])
    .filter((item) => !item.hidden && item.name)
    .map((item) => item.name);
  const targets = settings?.searchTerms?.value ?? [];

  return (
    <PageFrame icon={UserRound} title="About you" subtitle="Who you are and what you're aiming for">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !document ? (
        <section className="rounded-xl border bg-card p-6">
          <p className="text-sm">Your profile is built from your resume.</p>
          <Link to={RESUME_STUDIO_BASE} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            Import your resume in Document Studio
          </Link>
        </section>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="text-2xl font-semibold tracking-tight">{headline}</h2>
            {basics?.location ? <p className="text-sm text-muted-foreground">{basics.location}</p> : null}
            {summary ? <p className="max-w-3xl text-sm leading-relaxed">{summary}</p> : null}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <h3 className="text-base font-semibold">Core strengths</h3>
              {strengths.length ? (
                <ul className="flex flex-wrap gap-2">{strengths.map((s) => <Chip key={s}>{s}</Chip>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Add skills in your resume.</p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Target roles</h3>
                <Link to="/jobs/ready" className="text-sm text-primary hover:underline">Edit in Jobs</Link>
              </div>
              {targets.length ? (
                <ul className="flex flex-wrap gap-2">{targets.map((t) => <Chip key={t}>{t}</Chip>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Set search terms on the Jobs page.</p>
              )}
            </section>
          </div>
        </>
      )}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-5">
        <div>
          <p className="font-medium">Your documents are built from this page</p>
          <p className="text-sm text-muted-foreground">
            Change your resume and every tailored copy starts from it.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={RESUME_STUDIO_BASE} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Open resume</Link>
          <Link to={COVER_LETTER_STUDIO} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Cover letter voice</Link>
        </div>
      </section>
    </PageFrame>
  );
};
```

Before running: check how search terms are edited today. If it's the automatic-run card on the Jobs page, keep "Edit in Jobs" pointing at `/jobs/ready`. Otherwise point it wherever search terms are edited. If any field name differs from the shared types (`ReactiveResumeV5Document` in `shared/src/types/design-resume.ts`, `AppSettings.searchTerms`), use the real name. `npm run check:types` will flag it.

- [ ] **Step 8: Route.** In `App.tsx` add `<Route path="/profile" element={<AboutYouPage />} />` and import it. In `App.test.tsx` add `vi.mock("./pages/profile/AboutYouPage", () => ({ AboutYouPage: () => <div>about-you</div> }))` and a test that `/profile` renders `"about-you"`.

- [ ] **Step 9: Run tests**

Run: `npm --prefix orchestrator run test:run -- src/client/components/navigation.test.ts src/client/pages/profile src/client/App.test.tsx`
Expected: pass.

- [ ] **Step 10: Types, lint, commit**

```bash
npm run check:types && npm --prefix orchestrator run check
git add orchestrator/src/client
git commit -m "feat(profile): About you page and the final five-item sidebar"
```

### Task 11: Full verification

- [ ] **Step 1: Whole test suite**

Run: `npm --prefix orchestrator run test:run`
Expected: everything passes except the two known `ApplicationsPerDayChart` date tests.

- [ ] **Step 2: Types and Biome CI**

Run: `npm run check:types && npm run check:all`
Expected: clean.

- [ ] **Step 3: Leftover-link sweep**

Run: `grep -rn -E '"/(filtered|watchlist|spend|visa-sponsors|tracer-links|tracking-inbox|design-resume)\b|applications/in-progress' orchestrator/src/client | grep -v -E 'REDIRECTS|\.test\.|api/'`
Expected: no hits outside `App.tsx` `REDIRECTS` and the `OnboardingGate` compatibility check.

- [ ] **Step 4: Manual click-through** on the DB copy (Ground rules). Visit every row of the spec's "What moves where" table, old URL then new. Confirm:
  - Sidebar shows 5 items; Profile expands to About you / Document Studio only while inside Profile.
  - Board, Inbox, Filtered, Sources, Pre-score filter, Spend, Visa, Tracer links each load and their main action works.
  - Resume Studio editing still saves, and section links stay under `/profile/studio/resume/…`.
  - Cover letter tab shows voice + signature; "Edit voice" opens Settings › Writing Style.
  - At phone width (375px): tab strips wrap, nothing scrolls sideways.

- [ ] **Step 5: Report** what passed, what was checked by hand, and anything skipped. Ask Owen before pushing or opening a PR.

/**
 * Shared layout components for consistent page structure.
 */

import { getAppStatus, logout } from "@client/api";
import { PROFILE_BASE } from "@client/lib/routes";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  type LucideIcon,
  Menu,
  Palette,
  UserRound,
} from "lucide-react";
import React, { useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { queryKeys } from "../lib/queryKeys";
import {
  loadRememberedAuthUsers,
  type RememberedAuthUser,
} from "../lib/remembered-auth-users";
import { isNavActive, NAV_LINKS } from "./navigation";
import { StatusBadgeIndicator } from "./StatusIndicator";

export const AppModeContext = React.createContext({
  appMode: "local" as "local" | "hosted",
  isPending: false,
});

export const AppModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const appStatusQuery = useQuery({
    queryKey: queryKeys.app.status(),
    queryFn: getAppStatus,
  });

  return (
    <AppModeContext.Provider
      value={{
        appMode: appStatusQuery.data?.appMode ?? "local",
        isPending: appStatusQuery.isPending,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
};

const buildSignInPath = (username: string, nextPath: string): string => {
  const params = new URLSearchParams();
  params.set("user", username);
  if (
    nextPath &&
    nextPath !== "/sign-in" &&
    !nextPath.startsWith("/sign-in?")
  ) {
    params.set("next", nextPath);
  }
  return `/sign-in?${params.toString()}`;
};

// ============================================================================
// Sidebar navigation (shared by the slide-out Sheet and the fixed sidebar)
// ============================================================================

const SIDEBAR_ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** True when the app shell renders the persistent (lg+) sidebar. */
export const PersistentSidebarContext = React.createContext(false);

interface SidebarNavProps {
  /** Called after any item is chosen (the Sheet uses this to close itself). */
  onNavigated?: () => void;
  /** Wait for the Sheet close animation before navigating. */
  delayNavigation?: boolean;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  onNavigated,
  delayNavigation = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [rememberedUsers, setRememberedUsers] = useState<RememberedAuthUser[]>(
    () => loadRememberedAuthUsers(),
  );

  const handleNavClick = (
    to: string,
    activePaths?: string[],
    exact = false,
  ) => {
    const alreadyThere = exact
      ? location.pathname === to
      : isNavActive(location.pathname, to, activePaths);
    onNavigated?.();
    if (alreadyThere) return;
    if (delayNavigation) {
      setTimeout(() => navigate(to), 150);
    } else {
      navigate(to);
    }
  };

  const appearanceActive =
    location.pathname === "/settings" && location.hash === "#display";

  const handleAppearanceClick = () => {
    onNavigated?.();
    if (appearanceActive) return;
    if (delayNavigation) {
      setTimeout(() => navigate("/settings#display"), 150);
    } else {
      navigate("/settings#display");
    }
  };

  const handleRememberedUserClick = async (username: string) => {
    onNavigated?.();
    await logout({ redirect: false });
    navigate(buildSignInPath(username, location.pathname), { replace: true });
  };

  const handleSignOut = async () => {
    onNavigated?.();
    await logout();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Main" className="mt-6 flex flex-col gap-2">
        {NAV_LINKS.map(
          ({ to, label, icon: NavIcon, activePaths, children }) => (
            <div key={to} className="flex flex-col gap-1">
              <button
                type="button"
                aria-current={
                  isNavActive(location.pathname, to, activePaths)
                    ? "page"
                    : undefined
                }
                onClick={() =>
                  handleNavClick(
                    children?.[0]?.to ?? to,
                    activePaths,
                    Boolean(children),
                  )
                }
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
              {children
                ? children.map((child) => {
                    const childActive =
                      child.to === PROFILE_BASE
                        ? location.pathname === PROFILE_BASE
                        : isNavActive(
                            location.pathname,
                            child.to,
                            child.activePaths,
                          );
                    return (
                      <button
                        key={child.to}
                        type="button"
                        aria-current={childActive ? "page" : undefined}
                        onClick={() =>
                          handleNavClick(child.to, child.activePaths)
                        }
                        className={cn(
                          "ml-7 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                          childActive
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {child.label}
                      </button>
                    );
                  })
                : null}
            </div>
          ),
        )}
      </nav>
      <div className="mt-auto space-y-4 pt-6 pb-2">
        <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) setRememberedUsers(loadRememberedAuthUsers());
            }}
          >
            <DropdownMenuTrigger asChild>
              <button type="button" className={SIDEBAR_ITEM_CLASS}>
                <UserRound className="h-4 w-4" />
                <span>Account</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Remembered</DropdownMenuLabel>
              {rememberedUsers.length > 0 ? (
                rememberedUsers.map((user) => (
                  <DropdownMenuItem
                    key={user.username}
                    onSelect={() =>
                      void handleRememberedUserClick(user.username)
                    }
                    className="flex min-w-0 items-start gap-2"
                  >
                    <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {user.displayName ?? user.username}
                      </span>
                      {user.displayName ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.username}
                        </span>
                      ) : null}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  Sign in once to remember a username here.
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void handleSignOut()}
                className="gap-2"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            aria-current={appearanceActive ? "page" : undefined}
            onClick={handleAppearanceClick}
            className={cn(
              SIDEBAR_ITEM_CLASS,
              appearanceActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <Palette className="h-4 w-4" />
            <span>Appearance</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** Always-visible sidebar for lg+ screens; rendered once by the app shell. */
export const PersistentSidebar: React.FC = () => (
  <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col overflow-y-auto border-r bg-background p-4">
    <div className="px-3 text-lg font-semibold">JobOps</div>
    <SidebarNav />
  </aside>
);

// ============================================================================
// Page Header
// ============================================================================

interface PageHeaderProps {
  icon: LucideIcon | React.FC<{ className?: string }>;
  title: string;
  subtitle: string;
  badge?: string;
  statusIndicator?: React.ReactNode;
  actions?: React.ReactNode;
  navOpen?: boolean;
  onNavOpenChange?: (open: boolean) => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  badge,
  statusIndicator,
  actions,
  navOpen: controlledNavOpen,
  onNavOpenChange,
}) => {
  const [internalNavOpen, setInternalNavOpen] = useState(false);
  const navOpen = controlledNavOpen ?? internalNavOpen;
  const setNavOpen = onNavOpenChange ?? setInternalNavOpen;
  const hasPersistentSidebar = useContext(PersistentSidebarContext);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={hasPersistentSidebar ? "lg:hidden" : undefined}
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 flex flex-col">
              <SheetHeader>
                <SheetTitle>JobOps</SheetTitle>
              </SheetHeader>
              <SidebarNav
                onNavigated={() => setNavOpen(false)}
                delayNavigation
              />
            </SheetContent>
          </Sheet>

          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          {badge && (
            <Badge variant="outline" className="uppercase tracking-wide">
              {badge}
            </Badge>
          )}
          {statusIndicator}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          {actions}
        </div>
      </div>
    </header>
  );
};

export const StatusIndicator = StatusBadgeIndicator;

// ============================================================================
// Split Layout (List + Detail panels)
// ============================================================================

interface SplitLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const SplitLayout: React.FC<SplitLayoutProps> = ({
  children,
  className,
}) => (
  <section
    className={cn(
      "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]",
      className,
    )}
  >
    {children}
  </section>
);

// ============================================================================
// List Panel (left side of split)
// ============================================================================

interface ListPanelProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const ListPanel: React.FC<ListPanelProps> = ({
  children,
  header,
  footer,
  className,
}) => (
  <div
    className={cn(
      "min-w-0 rounded-xl border border-border/60 bg-card/40 flex flex-col",
      className,
    )}
  >
    {header && (
      <div className="border-b border-border/60 px-4 py-3">{header}</div>
    )}
    <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
      {children}
    </div>
    {footer && (
      <div className="border-t border-border/60 px-4 py-2">{footer}</div>
    )}
  </div>
);

// ============================================================================
// List Item (clickable row in list)
// ============================================================================

interface ListItemProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const ListItem: React.FC<ListItemProps> = ({
  selected,
  onClick,
  children,
  className,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors",
      selected ? "bg-muted/40" : "hover:bg-muted/30",
      className,
    )}
    aria-pressed={selected}
  >
    {children}
  </button>
);

// ============================================================================
// Detail Panel (right side of split)
// ============================================================================

interface DetailPanelProps {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  children,
  className,
  sticky = true,
}) => (
  <div
    className={cn(
      "min-w-0 rounded-xl border border-border/60 bg-card/40 p-4",
      sticky && "lg:sticky lg:top-24 lg:self-start",
      className,
    )}
  >
    {children}
  </div>
);

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
      className,
    )}
  >
    {Icon && <Icon className="h-10 w-10 text-muted-foreground/50 mb-2" />}
    <div className="text-base font-semibold">{title}</div>
    {description && (
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

// ============================================================================
// Score Meter
// ============================================================================

interface ScoreMeterProps {
  score: number | null;
  showLabel?: boolean;
}

const getScoreTokens = (score: number) => {
  if (score >= 90) return { bar: "bg-success/80" };
  if (score >= 70) return { bar: "bg-warning/80" };
  if (score >= 50) return { bar: "bg-caution/80" };
  return { bar: "bg-destructive/80" };
};

export const ScoreMeter: React.FC<ScoreMeterProps> = ({
  score,
  showLabel = true,
}) => {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }

  const tokens = getScoreTokens(score);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-12 rounded-full bg-muted/40">
        <div
          className={cn("h-1.5 rounded-full", tokens.bar)}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
      {showLabel && (
        <span className="tabular-nums text-foreground">{score}%</span>
      )}
    </div>
  );
};

// ============================================================================
// Full Height Split Layout (for pages like VisaSponsors that use full viewport)
// ============================================================================

interface FullHeightSplitProps {
  sidebar: React.ReactNode;
  sidebarWidth?: string;
  children: React.ReactNode;
}

export const FullHeightSplit: React.FC<FullHeightSplitProps> = ({
  sidebar,
  sidebarWidth = "lg:w-[420px]",
  children,
}) => (
  <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
    <div
      className={cn(
        "flex w-full flex-col border-b lg:border-b-0 lg:border-r",
        sidebarWidth,
      )}
    >
      {sidebar}
    </div>
    <div className="flex-1 overflow-y-auto">{children}</div>
  </div>
);

// ============================================================================
// Section Card (for forms, stats, etc.)
// ============================================================================

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  children,
  className,
}) => (
  <section
    className={cn(
      "rounded-xl border border-border/60 bg-card/40 p-4",
      className,
    )}
  >
    {children}
  </section>
);

// ============================================================================
// Page Main Content Wrapper
// ============================================================================

interface PageMainProps {
  children: React.ReactNode;
  className?: string;
}

export const PageMain: React.FC<PageMainProps> = ({ children, className }) => (
  <main
    className={cn("container mx-auto space-y-6 px-4 py-6 pb-12", className)}
  >
    {children}
  </main>
);

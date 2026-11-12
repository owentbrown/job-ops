/**
 * Shared layout components for consistent page structure.
 */

import { getAppStatus, logout } from "@client/api";
import { useOptionalAppearance } from "@client/lib/appearance/AppearanceProvider";
import { PROFILE_BASE } from "@client/lib/routes";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  Palette,
  Sun,
  UserRound,
} from "lucide-react";
import React, { useContext, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import {
  AppearanceControls,
  describeAppearance,
} from "./appearance/AppearanceControls";
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

/*
 * Sidebar styling is variable-driven (styles/appearance.generated.css):
 * --sidebar* colours, --nav-item-height, --radius-nav. The active row gets
 * --sidebar-accent(+foreground) and a 2px inset bar in --sidebar-primary,
 * which is transparent in the Soft theme (pill, no bar).
 */
const SIDEBAR_NAV_ITEM_CLASS =
  "flex h-(--nav-item-height) shrink-0 items-center gap-3 rounded-(--radius-nav) px-3.5 text-left text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const SIDEBAR_NAV_ITEM_ACTIVE_CLASS =
  "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]";
const SIDEBAR_NAV_ITEM_IDLE_CLASS = "font-medium text-sidebar-foreground";

/** Footer rows (Account, Appearance): boxed in --sidebar-footer-* colours. */
const SIDEBAR_FOOTER_ITEM_CLASS =
  "flex h-(--nav-item-height) w-full items-center gap-3 rounded-(--radius-nav) border border-(color:--sidebar-footer-border) bg-(--sidebar-footer-bg) px-3.5 text-left text-sm font-semibold text-(--sidebar-footer-foreground) transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:text-(--sidebar-footer-muted) hover:[&_svg]:text-current";

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
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_LINKS.map(
          ({ to, label, icon: NavIcon, activePaths, children }) => {
            const active = isNavActive(location.pathname, to, activePaths);
            return (
              <div key={to} className="flex flex-col gap-1">
                <button
                  type="button"
                  data-sidebar-item=""
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() =>
                    handleNavClick(
                      children?.[0]?.to ?? to,
                      activePaths,
                      Boolean(children),
                    )
                  }
                  className={cn(
                    SIDEBAR_NAV_ITEM_CLASS,
                    active
                      ? SIDEBAR_NAV_ITEM_ACTIVE_CLASS
                      : SIDEBAR_NAV_ITEM_IDLE_CLASS,
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
                          data-sidebar-subitem=""
                          className={cn(
                            "ml-7 rounded-(--radius-nav) px-3 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                            childActive
                              ? "font-semibold text-sidebar-accent-foreground"
                              : "text-sidebar-foreground",
                          )}
                        >
                          {child.label}
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          },
        )}
      </nav>
      <div className="mt-auto pt-6">
        <div data-sidebar-footer="" className="flex flex-col gap-1">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) setRememberedUsers(loadRememberedAuthUsers());
            }}
          >
            <DropdownMenuTrigger asChild>
              <button type="button" className={SIDEBAR_FOOTER_ITEM_CLASS}>
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
          <SidebarAppearanceItem
            onNavigated={onNavigated}
            delayNavigation={delayNavigation}
          />
        </div>
      </div>
    </div>
  );
};

const APPEARANCE_SETTINGS_PATH = "/settings#appearance";

/**
 * Sidebar footer "Appearance" item. Opens a popover with the compact
 * controls (also inside the mobile Sheet: Radix layers nest, so the popover
 * stacks above the drawer and Esc closes only the popover). Without an
 * AppearanceProvider it falls back to navigating to Settings -> Appearance.
 */
const SidebarAppearanceItem: React.FC<SidebarNavProps> = ({
  onNavigated,
  delayNavigation = false,
}) => {
  const appearance = useOptionalAppearance();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const subtitleId = useId();
  const onAppearancePage =
    location.pathname === "/settings" && location.hash === "#appearance";

  const label = (
    <>
      <Palette className="h-4 w-4 shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span>Appearance</span>
        {appearance ? (
          <span
            id={subtitleId}
            data-appearance-summary=""
            className="truncate text-xs font-normal text-(--sidebar-footer-muted)"
          >
            {describeAppearance(appearance.choice)}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!appearance) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigated?.();
          if (onAppearancePage) return;
          if (delayNavigation) {
            setTimeout(() => navigate(APPEARANCE_SETTINGS_PATH), 150);
          } else {
            navigate(APPEARANCE_SETTINGS_PATH);
          }
        }}
        className={SIDEBAR_FOOTER_ITEM_CLASS}
      >
        {label}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Appearance"
          aria-describedby={subtitleId}
          data-sidebar-appearance=""
          className={cn(
            SIDEBAR_FOOTER_ITEM_CLASS,
            "h-auto min-h-(--nav-item-height) py-2",
            (open || onAppearancePage) &&
              "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Appearance"
        className="flex w-[min(330px,calc(100vw-2rem))] flex-col gap-4.5 p-5 shadow-lg"
      >
        <div className="font-heading text-base font-(weight:--heading-weight)">
          Appearance
        </div>
        <AppearanceControls size="compact" />
        <Link
          to={APPEARANCE_SETTINGS_PATH}
          onClick={() => {
            setOpen(false);
            onNavigated?.();
          }}
          className="border-t border-border pt-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          All settings live in Settings → Appearance
        </Link>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Sun/moon quick toggle for the page header: flips the resolved mode and
 * sets it explicitly (leaves System). Hidden without an AppearanceProvider.
 */
export const HeaderModeToggle: React.FC<{ className?: string }> = ({
  className,
}) => {
  const appearance = useOptionalAppearance();
  if (!appearance) return null;
  const dark = appearance.resolvedMode === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-header-mode-toggle=""
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={appearance.toggleLightDark}
      className={cn("shrink-0", className)}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
};

/**
 * Always-visible sidebar for lg+ screens; rendered once by the app shell.
 * Geometry (width, floating inset, radius, brand size) is per theme in
 * styles/appearance-structure.css; App.tsx offsets the content by
 * --app-content-offset to match.
 */
export const PersistentSidebar: React.FC = () => (
  <aside
    data-app-sidebar=""
    className="hidden lg:flex fixed z-30 top-(--app-sidebar-inset) bottom-(--app-sidebar-inset) left-(--app-sidebar-inset) w-(--app-sidebar-width) flex-col overflow-y-auto rounded-(--app-sidebar-radius) border-r-(length:--sidebar-border-width) border-sidebar-border bg-sidebar px-3 pt-5.5 pb-3.5 text-sidebar-foreground"
  >
    <div
      data-sidebar-brand=""
      className="px-3 pb-4.5 font-heading text-(length:--app-sidebar-brand-size) font-(weight:--heading-weight) leading-tight text-(--sidebar-brand)"
    >
      JobOps
    </div>
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
      <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
            <SheetContent
              side="left"
              data-app-sidebar-sheet=""
              className="flex w-64 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              <SheetHeader>
                <SheetTitle className="font-heading font-(weight:--heading-weight) text-(--sidebar-brand)">
                  JobOps
                </SheetTitle>
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
            <div
              data-page-title=""
              className="font-heading text-lg font-(weight:--heading-weight) tracking-(--heading-tracking)"
            >
              {title}
            </div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          {badge && (
            <Badge variant="outline" className="uppercase tracking-wide">
              {badge}
            </Badge>
          )}
          {statusIndicator}
        </div>

        {/* Mobile: title row + toggle, actions wrap below. sm+: actions, then
            the toggle at the far right. */}
        <HeaderModeToggle className="order-2 sm:order-3" />
        {actions ? (
          <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            {actions}
          </div>
        ) : null}
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
      "rounded-(--radius) border-(length:--card-border-width) border-border/60 bg-card/40 p-4",
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
    className={cn(
      "container mx-auto space-y-6 px-4 pt-(--density-pad) pb-12",
      className,
    )}
  >
    {children}
  </main>
);

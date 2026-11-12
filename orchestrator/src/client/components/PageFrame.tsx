import type { LucideIcon } from "lucide-react";
import type React from "react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, PageMain } from "./layout";

type EmbeddedState = { embedded: boolean; hideHeading: boolean };
const EmbeddedContext = createContext<EmbeddedState>({
  embedded: false,
  hideHeading: false,
});

/** Wrap a page component to render it as a section inside another page. */
export const EmbeddedPage: React.FC<{
  children: React.ReactNode;
  hideHeading?: boolean;
}> = ({ children, hideHeading = false }) => (
  <EmbeddedContext.Provider value={{ embedded: true, hideHeading }}>
    {children}
  </EmbeddedContext.Provider>
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
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      <div className={cn("space-y-6", mainClassName)}>{children}</div>
    </div>
  );
};

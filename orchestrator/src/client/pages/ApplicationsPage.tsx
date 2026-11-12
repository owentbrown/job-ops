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
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

export const ApplicationsPage: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const { appMode, isPending } = React.useContext(AppModeContext);
  const inboxAllowed = appMode !== "hosted";

  if (isPending) return null;
  if (tab !== "board" && tab !== "inbox") {
    return <Navigate to="/applications/board" replace />;
  }
  if (tab === "inbox" && !inboxAllowed) {
    return <Navigate to="/applications/board" replace />;
  }

  const active: AppTab = tab;

  return (
    <PageFrame
      icon={Columns3}
      title="Applications"
      subtitle="Everything after you apply"
    >
      {inboxAllowed ? (
        <nav
          aria-label="Applications views"
          className="inline-flex gap-1 self-start rounded-lg bg-muted p-1"
        >
          <NavLink to="/applications/board" className={linkClass}>
            Board
          </NavLink>
          <NavLink to="/applications/inbox" className={linkClass}>
            Inbox
          </NavLink>
        </nav>
      ) : null}
      <EmbeddedPage hideHeading>
        {active === "board" ? <InProgressBoardPage /> : <TrackingInboxPage />}
      </EmbeddedPage>
    </PageFrame>
  );
};

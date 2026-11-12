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
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

/** Rendered as the first child of each page's main, directly under its header. */
const StudioSwitch: React.FC = () => (
  <nav
    aria-label="Document type"
    className="inline-flex w-fit shrink-0 gap-1 self-start rounded-lg bg-muted p-1"
  >
    <NavLink to={RESUME_STUDIO_BASE} className={linkClass}>
      <FileText className="h-4 w-4" aria-hidden="true" />
      Resume
    </NavLink>
    <NavLink to={COVER_LETTER_STUDIO} className={linkClass}>
      <Mail className="h-4 w-4" aria-hidden="true" />
      Cover letter
    </NavLink>
  </nav>
);

export const ProfileStudioPage: React.FC = () => {
  const { doc } = useParams<{ doc: string }>();
  if (doc !== "resume" && doc !== "cover-letter") {
    return <Navigate to={RESUME_STUDIO_BASE} replace />;
  }

  return doc === "resume" ? (
    <DesignResumePage toolbar={<StudioSwitch />} />
  ) : (
    <CoverLetterStudio switcher={<StudioSwitch />} />
  );
};

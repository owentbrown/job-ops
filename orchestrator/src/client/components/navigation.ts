import { PROFILE_BASE } from "@client/lib/routes";
import {
  Columns3,
  Home,
  LayoutDashboard,
  Settings,
  UserRound,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
  children?: Array<{ to: string; label: string; activePaths?: string[] }>;
};

export const NAV_LINKS: NavLink[] = [
  { to: "/overview", label: "Overview", icon: Home },
  {
    to: "/jobs/ready",
    label: "Jobs",
    icon: LayoutDashboard,
    activePaths: [
      "/jobs/ready",
      "/jobs/discovered",
      "/jobs/applied",
      "/jobs/all",
      "/jobs/filtered",
    ],
  },
  {
    to: "/applications/board",
    label: "Applications",
    icon: Columns3,
    activePaths: ["/applications"],
  },
  {
    to: PROFILE_BASE,
    label: "Profile",
    icon: UserRound,
    activePaths: [PROFILE_BASE],
    children: [
      { to: PROFILE_BASE, label: "About you" },
      {
        to: "/profile/studio/resume",
        label: "Document Studio",
        activePaths: ["/profile/studio"],
      },
    ],
  },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => {
  if (pathname === to) return true;
  if (!activePaths) return false;
  return activePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
};

import {
  Columns3,
  FilePenLine,
  Home,
  LayoutDashboard,
  Settings,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
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
    to: "/profile/studio/resume",
    label: "Resume Studio",
    icon: FilePenLine,
    activePaths: ["/profile"],
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

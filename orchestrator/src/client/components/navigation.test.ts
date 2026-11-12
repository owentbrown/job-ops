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

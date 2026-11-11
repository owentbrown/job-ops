import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPersonalLatexDocument } from "./latex-personal";
import type { ResumeRenderDocument } from "./types";

const doc: ResumeRenderDocument = {
  name: "Owen Brown",
  headline: "Product Operations Manager",
  location: "Kitchener, ON",
  picture: null,
  contactItems: [
    { text: "519-000-0000", kind: "phone" },
    { text: "me@example.com", url: "mailto:me@example.com", kind: "email" },
  ],
  profileItems: [
    {
      network: "LinkedIn",
      username: "me",
      url: "https://linkedin.com/in/me",
    },
  ],
  customFieldItems: [],
  summary: "Secured over $20M & more.",
  experience: [
    {
      title: "Sun Life",
      subtitle: "Senior Strategy Consultant",
      date: "Aug 2022 - Present",
      bullets: ["Did a thing.", "Did another."],
    },
    {
      title: "Bosch",
      subtitle: "Assistant",
      date: "2018",
      bullets: [],
    },
    {
      title: "PointClickCare",
      subtitle: "Coordinator",
      date: "2017",
      bullets: ["Found backlog revenue."],
    },
  ],
  education: [
    { title: "University of Waterloo", subtitle: "Honours BA", bullets: [] },
  ],
  projects: [{ title: "Baby Name App", bullets: ["Built it."] }],
  skillGroups: [
    { name: "Business cases", keywords: [] },
    { name: "Tools", keywords: ["SQL", "Tableau"] },
  ],
  languages: [],
  interests: [],
  awards: [],
  certifications: [
    {
      title: "CAPM",
      subtitle: "Project Management Institute",
      bullets: [],
    },
  ],
  publications: [],
  volunteer: [],
  references: [],
};

async function template() {
  return readFile(join(__dirname, "templates", "personal-resume.tex"), "utf8");
}

describe("buildPersonalLatexDocument", () => {
  it("fills his header macro with name, location, contact, link and headline", async () => {
    const tex = buildPersonalLatexDocument(
      doc,
      await template(),
      "letterpaper",
    );
    expect(tex).toContain("\\documentclass[10pt,letterpaper]{article}");
    expect(tex).toContain(
      "\\resumeHeader{Owen Brown}{Kitchener, ON}{519-000-0000 {\\textbar} me@example.com}{linkedin.com/in/me}{https://linkedin.com/in/me}{Product Operations Manager}",
    );
    expect(tex).not.toContain("__BODY__");
  });

  it("escapes dollar signs and ampersands in the summary", async () => {
    const tex = buildPersonalLatexDocument(
      doc,
      await template(),
      "letterpaper",
    );
    expect(tex).toContain(
      "\\resumeSection{Professional Summary}\n\\resumeParagraph{Secured over \\$20M \\& more.}",
    );
  });

  it("lists skills as Core Strengths bullets", async () => {
    const tex = buildPersonalLatexDocument(
      doc,
      await template(),
      "letterpaper",
    );
    expect(tex).toContain("\\resumeSection{Core Strengths}");
    expect(tex).toContain("\\resumeBullet{Business cases}");
    expect(tex).toContain("\\resumeBullet{Tools: SQL, Tableau}");
  });

  it("uses Company/Role/Date subheadings and collapses older roles", async () => {
    const tex = buildPersonalLatexDocument(
      doc,
      await template(),
      "letterpaper",
    );
    expect(tex).toContain(
      "\\resumeSubheading{Sun Life}{Senior Strategy Consultant}{Aug 2022 - Present}",
    );
    expect(tex).toContain("\\resumeSubheading{Earlier Experience}{}{}");
    expect(tex).toContain(
      "\\resumeBullet{PointClickCare {\\textbar} Coordinator {\\textbar} 2017; found backlog revenue.}",
    );
  });

  it("lists certifications under Education as Name | Issuer", async () => {
    const tex = buildPersonalLatexDocument(
      doc,
      await template(),
      "letterpaper",
    );
    expect(tex).toContain(
      "\\resumeBullet{CAPM {\\textbar} Project Management Institute}",
    );
    expect(tex).not.toContain("\\resumeSection{Certifications}");
  });

  it("puts experience before education", async () => {
    const tex = buildPersonalLatexDocument(
      { ...doc, sectionOrder: ["education", "experience", "projects"] },
      await template(),
      "letterpaper",
    );
    expect(tex.indexOf("{Experience}")).toBeLessThan(
      tex.indexOf("{Education}"),
    );
  });
});

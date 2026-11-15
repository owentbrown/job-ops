import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeExperienceBulletSelection } from "@shared/resume-experience-bullets";
import { describe, expect, it, vi } from "vitest";
import { buildResumeRenderDocument } from "../resume-renderer/document";
import { buildLatexDocument } from "../resume-renderer/latex";
import { buildPersonalLatexDocument } from "../resume-renderer/latex-personal";
import { prepareTailoredResumeForPdf } from "./index";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/tenancy/context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-1"),
}));

const section = (title: string, items: unknown[] = []) => ({
  title,
  columns: 1,
  hidden: false,
  items,
});

const role = (
  id: string,
  company: string,
  period: string,
  bulletCount: number,
) => ({
  id,
  hidden: false,
  company,
  position: "Analyst",
  location: "",
  period,
  website: { url: "", label: "" },
  description: `<ul>${Array.from(
    { length: bulletCount },
    (_, index) => `<li><p>${company} bullet ${index + 1}</p></li>`,
  ).join("")}</ul>`,
  roles: [],
});

/** A "master" resume: every role keeps all of its bullets. */
function buildMasterResume() {
  return {
    picture: {
      hidden: true,
      url: "",
      size: 96,
      rotation: 0,
      aspectRatio: 1,
      borderRadius: 0,
      borderColor: "#000000",
      borderWidth: 0,
      shadowColor: "#000000",
      shadowWidth: 0,
    },
    basics: {
      name: "Test Person",
      headline: "Original Headline",
      email: "",
      phone: "",
      location: "",
      website: { url: "", label: "" },
      customFields: [],
    },
    summary: {
      title: "Summary",
      columns: 1,
      hidden: false,
      content: "Original Summary",
    },
    sections: {
      profiles: section("Profiles"),
      experience: section("Experience", [
        role("r1", "Acme", "2023 - Present", 6),
        role("r2", "Globex", "2020 - 2023", 5),
        role("r3", "Initech", "2018 - 2020", 5),
        role("r4", "Umbrella", "2016 - 2018", 4),
        role("r5", "Hooli", "2014 - 2016", 4),
      ]),
      education: section("Education"),
      projects: section("Projects"),
      skills: section("Skills"),
      languages: section("Languages"),
      interests: section("Interests"),
      awards: section("Awards"),
      certifications: section("Certifications"),
      publications: section("Publications"),
      volunteer: section("Volunteer"),
      references: section("References"),
    },
    customSections: [],
    metadata: {
      template: "rhyhorn",
      layout: {
        sidebarWidth: 220,
        pages: [
          {
            fullWidth: false,
            main: ["summary", "experience", "education", "projects"],
            sidebar: ["profiles", "skills", "languages"],
          },
        ],
      },
      css: { enabled: false, value: "" },
      page: {
        gapX: 18,
        gapY: 18,
        marginX: 18,
        marginY: 18,
        format: "a4",
        locale: "en",
        hideIcons: false,
        options: { breakLine: true, pageNumbers: true },
      },
      design: {
        level: { icon: "circle", type: "hidden" },
        colors: {
          background: "#ffffff",
          text: "#000000",
          primary: "#2563eb",
        },
      },
      typography: {
        body: {
          fontFamily: "Inter",
          fontWeights: ["regular"],
          fontSize: 14,
          lineHeight: 1.5,
        },
        heading: {
          fontFamily: "Inter",
          fontWeights: ["600"],
          fontSize: 14,
          lineHeight: 1.25,
        },
      },
      notes: "",
    },
  };
}

// Recent roles keep 3-4, mid-career 2, the oldest 0-1.
const SELECTION = serializeExperienceBulletSelection({
  r1: [0, 2, 3, 5],
  r2: [0, 1, 4],
  r3: [1, 3],
  r4: [2],
  r5: [],
});

const template = (name: string) =>
  readFile(join(__dirname, "..", "resume-renderer", "templates", name), "utf8");

async function prepare(experienceBullets: string | null) {
  const base = buildMasterResume();
  const baseSnapshot = JSON.parse(JSON.stringify(base));
  const prepared = await prepareTailoredResumeForPdf({
    resumeData: base,
    tailoredContent: { experienceBullets },
    jobDescription: "Analyst role",
  });
  return { base, baseSnapshot, prepared };
}

describe("experience bullet selection in tailored PDFs", () => {
  it("trims bullets in the tailored document and leaves the base resume untouched", async () => {
    const { base, baseSnapshot, prepared } = await prepare(SELECTION);

    expect(base).toEqual(baseSnapshot);

    const document = buildResumeRenderDocument(prepared.data);
    expect(document.experience.map((entry) => entry.bullets)).toEqual([
      ["Acme bullet 1", "Acme bullet 3", "Acme bullet 4", "Acme bullet 6"],
      ["Globex bullet 1", "Globex bullet 2", "Globex bullet 5"],
      ["Initech bullet 2", "Initech bullet 4"],
      ["Umbrella bullet 3"],
      [],
    ]);
  });

  it("renders exactly today's output when there is no selection", async () => {
    const { prepared } = await prepare(null);
    const baseDocument = buildResumeRenderDocument(buildMasterResume());
    const document = buildResumeRenderDocument(prepared.data);

    expect(document.experience).toEqual(baseDocument.experience);
    expect(document.experience.map((entry) => entry.bullets.length)).toEqual([
      6, 5, 5, 4, 4,
    ]);

    const personal = await template("personal-resume.tex");
    expect(buildPersonalLatexDocument(document, personal, "letterpaper")).toBe(
      buildPersonalLatexDocument(baseDocument, personal, "letterpaper"),
    );
    expect(
      buildPersonalLatexDocument(document, personal, "letterpaper"),
    ).not.toContain("Earlier Experience");
  });

  it("collapses older roles trimmed to at most one bullet into Earlier Experience (personal layout)", async () => {
    const { prepared } = await prepare(SELECTION);
    const tex = buildPersonalLatexDocument(
      buildResumeRenderDocument(prepared.data),
      await template("personal-resume.tex"),
      "letterpaper",
    );

    expect(tex).toContain("\\resumeSubheading{Earlier Experience}{}{}");
    expect(tex).toContain(
      "\\resumeBullet{Umbrella {\\textbar} Analyst {\\textbar} 2016 - 2018; umbrella bullet 3}",
    );
    expect(tex).toContain(
      "\\resumeBullet{Hooli {\\textbar} Analyst {\\textbar} 2014 - 2016}",
    );
    expect(tex).toContain("\\resumeSubheading{Initech}{Analyst}{2018 - 2020}");
    expect(tex).not.toContain("Acme bullet 2");
    expect(tex).not.toContain("Umbrella bullet 1");
  });

  it("drops unselected bullets from the jake LaTeX layout", async () => {
    const { prepared } = await prepare(SELECTION);
    const tex = buildLatexDocument(
      buildResumeRenderDocument(prepared.data),
      await template("jake-resume.tex"),
    );

    expect(tex).toContain("Acme bullet 1");
    expect(tex).toContain("Acme bullet 6");
    expect(tex).not.toContain("Acme bullet 2");
    expect(tex).not.toContain("Hooli bullet");
    expect(tex).toContain("Hooli");
  });

  it("ignores a stored selection for roles no longer in the resume", async () => {
    const { prepared } = await prepare(
      serializeExperienceBulletSelection({ gone: [0], r1: [1] }),
    );
    const document = buildResumeRenderDocument(prepared.data);
    expect(document.experience[0].bullets).toEqual(["Acme bullet 2"]);
    expect(document.experience[1].bullets).toHaveLength(5);
  });
});

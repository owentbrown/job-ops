import { getLatexResumeSectionTitles } from "./document";
import { cleanUrlForDisplay, escapeForCommand, escapeLatexUrl } from "./latex";
import type {
  LatexResumeDocument,
  LatexResumeEntry,
  LatexResumeOrderedSectionKey,
} from "./types";

/**
 * Builds a .tex file for Owen's own resume layout (templates/personal-resume.tex),
 * using his macros: \resumeHeader, \resumeSection, \resumeParagraph,
 * \resumeSubheading{context}{title}{date} and resumebullets/\resumeBullet.
 * Content comes from the same document as the other renderers, so tailored
 * headline, summary and skills flow in automatically.
 */

const DEFAULT_ORDER: LatexResumeOrderedSectionKey[] = [
  "experience",
  "projects",
  "education",
  "certifications",
  "awards",
  "volunteer",
  "publications",
  "languages",
  "interests",
  "references",
];

/** His section names, used when the profile keeps the generic defaults. */
const PREFERRED_TITLES: Partial<Record<string, string>> = {
  Summary: "Professional Summary",
  Skills: "Core Strengths",
  "Technical Skills": "Core Strengths",
};

function sectionTitle(title: string): string {
  return escapeForCommand(PREFERRED_TITLES[title] ?? title);
}

function bullets(items: string[]): string {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return [
    "\\begin{resumebullets}",
    ...clean.map((item) => `  \\resumeBullet{${escapeForCommand(item)}}`),
    "\\end{resumebullets}",
  ].join("\n");
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" | ");
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `\\resumeSection{${sectionTitle(title)}}\n${body}\n`;
}

/** Company line small, role bold, dates right: \resumeSubheading{Company}{Role}{Dates}. */
function subheadingEntries(entries: LatexResumeEntry[]): string {
  return entries
    .map((entry) => {
      const context = escapeForCommand(
        joinParts([entry.title, entry.secondarySubtitle]),
      );
      const role = escapeForCommand(
        joinParts([entry.subtitle, entry.secondaryTitle]),
      );
      const date = escapeForCommand(entry.date ?? "");
      const head = role
        ? `\\resumeSubheading{${context}}{${role}}{${date}}`
        : `\\resumeSubheading{${joinParts([context, date])}}{}{}`;
      const list = bullets(entry.bullets);
      return list ? `${head}\n${list}` : head;
    })
    .join("\n\n");
}

/**
 * His "Experience" layout: full entries, then older roles that have at most
 * one bullet collapsed into one "Earlier Experience" list
 * ("Company | Role | Dates; bullet").
 */
function experienceEntries(entries: LatexResumeEntry[]): string {
  let split = entries.length;
  while (split > 0 && entries[split - 1].bullets.length <= 1) split -= 1;
  const earlier = entries.slice(split);
  if (earlier.length < 2) return subheadingEntries(entries);
  const lines = earlier.map((entry) => {
    const line = joinParts([
      entry.title,
      joinParts([entry.subtitle, entry.secondaryTitle]),
      entry.date,
    ]);
    const extra = entry.bullets[0]?.trim();
    return extra
      ? `${line}; ${extra.charAt(0).toLowerCase()}${extra.slice(1)}`
      : line;
  });
  return [
    subheadingEntries(entries.slice(0, split)),
    `\\resumeSubheading{Earlier Experience}{}{}\n${bullets(lines)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Projects read "Personal Project / App name": subtitle small, name bold. */
function projectEntries(entries: LatexResumeEntry[]): string {
  return entries
    .map((entry) => {
      const context = escapeForCommand(entry.subtitle ?? "");
      const name = escapeForCommand(entry.title);
      const date = escapeForCommand(entry.date ?? "");
      const head = context
        ? `\\resumeSubheading{${context}}{${name}}{${date}}`
        : `\\resumeSubheading{${joinParts([name, date])}}{}{}`;
      const list = bullets(entry.bullets);
      return list ? `${head}\n${list}` : head;
    })
    .join("\n\n");
}

/** One bullet per entry, "Degree | School | Dates" style (his Education list). */
function lineEntries(entries: LatexResumeEntry[]): string {
  return bullets(
    entries.map((entry) =>
      joinParts([
        joinParts([entry.subtitle, entry.secondaryTitle]),
        entry.title,
        entry.date,
      ]),
    ),
  );
}

function buildHeader(document: LatexResumeDocument): string {
  const contact = document.contactItems
    .filter((item) => item.kind !== "website")
    .map((item) => escapeForCommand(item.text))
    .join(" {\\textbar} ");
  const profile =
    document.profileItems.find((item) =>
      /linkedin/i.test(`${item.network} ${item.url ?? ""}`),
    ) ?? document.profileItems[0];
  const website = document.contactItems.find(
    (item) => item.kind === "website" && item.url,
  );
  const linkUrl = profile?.url ?? website?.url ?? "";
  const linkText = linkUrl
    ? cleanUrlForDisplay(linkUrl)
    : (profile?.username ?? "");
  return `\\resumeHeader{${escapeForCommand(document.name)}}{${escapeForCommand(
    document.location ?? "",
  )}}{${contact}}{${escapeForCommand(linkText)}}{${
    linkUrl ? escapeLatexUrl(linkUrl) : ""
  }}{${escapeForCommand(document.headline ?? "")}}`;
}

export function buildPersonalLatexDocument(
  document: LatexResumeDocument,
  template: string,
  paperOption: string,
): string {
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();

  const skills = bullets(
    document.skillGroups.map((group) =>
      group.keywords.length > 0
        ? `${group.name}: ${group.keywords.join(", ")}`
        : group.name,
    ),
  );

  const builders: Record<LatexResumeOrderedSectionKey, () => string> = {
    profiles: () => "",
    skills: () => "",
    experience: () =>
      section(titles.experience, experienceEntries(document.experience)),
    projects: () => section(titles.projects, projectEntries(document.projects)),
    // Like his resume: certifications are listed under Education as
    // "Name | Issuer".
    education: () =>
      section(
        titles.education,
        [
          lineEntries(document.education),
          bullets(
            document.certifications.map((entry) =>
              joinParts([entry.title, entry.subtitle, entry.date]),
            ),
          ),
        ]
          .filter(Boolean)
          .join("\n")
          .replace(/\\end\{resumebullets\}\n\\begin\{resumebullets\}\n/, ""),
      ),
    certifications: () =>
      document.education.length > 0
        ? ""
        : section(
            titles.certifications,
            bullets(
              document.certifications.map((entry) =>
                joinParts([entry.title, entry.subtitle, entry.date]),
              ),
            ),
          ),
    awards: () => section(titles.awards, lineEntries(document.awards)),
    volunteer: () =>
      section(titles.volunteer, subheadingEntries(document.volunteer)),
    publications: () =>
      section(titles.publications, lineEntries(document.publications)),
    references: () =>
      section(titles.references, subheadingEntries(document.references)),
    languages: () =>
      section(
        titles.languages,
        bullets(
          document.languages.map((item) =>
            joinParts([item.language, item.fluency]),
          ),
        ),
      ),
    interests: () =>
      section(
        titles.interests,
        bullets(
          document.interests.map((item) =>
            item.keywords.length > 0
              ? `${item.name}: ${item.keywords.join(", ")}`
              : item.name,
          ),
        ),
      ),
  };

  // His layout: summary, strengths, experience and projects first, then the
  // rest in profile order.
  const order: LatexResumeOrderedSectionKey[] = [
    "experience",
    "projects",
    ...(document.sectionOrder ?? DEFAULT_ORDER).filter(
      (key) => !["skills", "profiles", "experience", "projects"].includes(key),
    ),
  ];

  const body = [
    buildHeader(document),
    document.summary
      ? section(
          titles.summary,
          `\\resumeParagraph{${escapeForCommand(document.summary)}}`,
        )
      : "",
    section(
      titles.customFields,
      bullets(
        document.customFieldItems.map((item) =>
          joinParts([item.title, item.text]),
        ),
      ),
    ),
    section(titles.skills, skills),
    ...order.map((key) => builders[key]()),
  ]
    .filter(Boolean)
    .join("\n\n");

  // Function replacers: resume text contains "$" (e.g. \$20M), which a
  // string replacement would treat as a pattern.
  return template
    .replace("__PAPER_SIZE__", () => paperOption)
    .replace("__BODY__", () => body);
}

import { describe, expect, it } from "vitest";
import type { LatexResumeDocument } from "../resume-renderer/types";
import {
  buildCoverLetterBody,
  fillCoverLetterTemplate,
  formatLetterDate,
  inlineLatex,
  parseCoverLetter,
} from "./format";
import { buildCoverLetterPrompt } from "./generate";

const document = {
  name: "Owen Brown",
  location: "Kitchener, ON",
  contactItems: [
    { text: "519-504-0412", kind: "phone" },
    {
      text: "owen@brownmail.ca",
      url: "mailto:owen@brownmail.ca",
      kind: "email",
    },
  ],
  profileItems: [
    { network: "LinkedIn", url: "https://linkedin.com/in/owentb" },
  ],
} as unknown as LatexResumeDocument;

const LETTER = `Hey Jackie!

Your posting stood out. Sprout's mission
is one I connect with.

I've been working in several capacities:

- **Owning problems:** I created the first health strategy.
- **Measurement:** I own the QBR,
  monthly reporting and AIP commentary.

I'm itching to join a great team.

Best,
Owen Brown`;

describe("parseCoverLetter", () => {
  it("splits greeting, paragraphs, bullets and sign-off", () => {
    const parsed = parseCoverLetter(LETTER, "Owen Brown");
    expect(parsed.greeting).toBe("Hey Jackie!");
    expect(parsed.signoff).toBe("Best,");
    expect(parsed.blocks).toEqual([
      {
        kind: "paragraph",
        text: "Your posting stood out. Sprout's mission is one I connect with.",
      },
      { kind: "paragraph", text: "I've been working in several capacities:" },
      {
        kind: "bullets",
        items: [
          "**Owning problems:** I created the first health strategy.",
          "**Measurement:** I own the QBR, monthly reporting and AIP commentary.",
        ],
      },
      { kind: "paragraph", text: "I'm itching to join a great team." },
    ]);
  });

  it("keeps a lone final paragraph and has no greeting for a single block", () => {
    const parsed = parseCoverLetter("Just one paragraph.", "Owen Brown");
    expect(parsed.greeting).toBeNull();
    expect(parsed.signoff).toBeNull();
    expect(parsed.blocks).toEqual([
      { kind: "paragraph", text: "Just one paragraph." },
    ]);
  });

  it("drops a trailing name line without a sign-off", () => {
    const parsed = parseCoverLetter(
      "Hi team,\n\nBody.\n\nOwen Brown",
      "Owen Brown",
    );
    expect(parsed.signoff).toBeNull();
    expect(parsed.blocks).toEqual([{ kind: "paragraph", text: "Body." }]);
  });
});

describe("inlineLatex", () => {
  it("escapes special characters and converts bold", () => {
    expect(inlineLatex("**Saved $1M:** 20% & more_x")).toBe(
      "\\textbf{Saved \\$1M:} 20\\% \\& more\\_x",
    );
  });
});

describe("buildCoverLetterBody", () => {
  it("renders the header, date, body and signature", () => {
    const body = buildCoverLetterBody({
      document,
      text: LETTER,
      date: new Date("2026-10-17T15:00:00Z"),
      signatureFile: "signature.png",
    });
    expect(body).toContain(
      "\\letterHeader{Owen Brown}{Kitchener, ON}{owen@brownmail.ca}{519-504-0412}{linkedin.com/in/owentb}{https://linkedin.com/in/owentb}",
    );
    expect(body).toContain("\\letterDate{October 17, 2026}");
    expect(body).toContain("\\letterGreeting{Hey Jackie!}");
    expect(body).toContain(
      "\\letterBullet{\\textbf{Owning problems:} I created the first health strategy.}",
    );
    expect(body).toContain("\\letterSignoff{Best,}{Owen Brown}{signature.png}");
  });

  it("fills the template and appends the resume only when asked", () => {
    const template = "A\n__BODY__\n__APPEND_PDF__\nZ";
    expect(fillCoverLetterTemplate(template, "costs \\$5", null)).toBe(
      "A\ncosts \\$5\n\nZ",
    );
    expect(fillCoverLetterTemplate(template, "x", "resume.pdf")).toContain(
      "\\includepdf[pages=-]{resume.pdf}",
    );
  });
});

describe("formatLetterDate", () => {
  it("uses the Toronto calendar day by default", () => {
    expect(formatLetterDate(new Date("2026-10-18T02:00:00Z"))).toBe(
      "October 17, 2026",
    );
  });
});

describe("buildCoverLetterPrompt", () => {
  it("includes the job, profile, example and the user's notes", () => {
    const prompt = buildCoverLetterPrompt({
      job: {
        title: "BizOps Lead",
        employer: "Sprout",
        location: "Remote, Canada",
        jobDescription: "<p>Own operations</p>",
      },
      profileJson: '{"name":"Owen"}',
      example: "Hey Jackie!",
      tone: "warm",
      formality: "medium",
      constraints: "",
      doNotUse: "synergy",
      instructions: "Hiring manager is Jackie",
    });
    expect(prompt).toContain("Company: Sprout");
    expect(prompt).toContain("Own operations");
    expect(prompt).not.toContain("<p>");
    expect(prompt).toContain('{"name":"Owen"}');
    expect(prompt).toContain("<example_letter>\nHey Jackie!");
    expect(prompt).toContain("Never use these words or phrases: synergy");
    expect(prompt).toContain("Hiring manager is Jackie");
  });
});

describe("cover-letter.tex template", () => {
  it("has each placeholder once, so filling leaves none behind", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolveTemplatePath } = await import("../resume-renderer/latex");
    const template = await readFile(
      resolveTemplatePath("cover-letter.tex"),
      "utf8",
    );
    expect(template.split("__BODY__")).toHaveLength(2);
    expect(template.split("__APPEND_PDF__")).toHaveLength(2);
    const filled = fillCoverLetterTemplate(template, "BODY", "resume.pdf");
    expect(filled).not.toMatch(/__[A-Z_]+__/);
    expect(filled).toContain("BODY\n\\includepdf[pages=-]{resume.pdf}");
  });
});

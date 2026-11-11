import {
  cleanUrlForDisplay,
  escapeForCommand,
  escapeLatexUrl,
} from "../resume-renderer/latex";
import type { LatexResumeDocument } from "../resume-renderer/types";

/**
 * Cover letter drafts are plain text the user can edit:
 *
 *   Hey Jackie!                      <- first block: greeting
 *
 *   A paragraph...
 *
 *   - **Bold lead-in:** a bullet     <- lines starting "- " are bullets
 *
 *   Best,                            <- optional short sign-off at the end
 *   Owen Brown                       <- (the name line is dropped; it's printed anyway)
 *
 * Blocks are separated by blank lines. **text** becomes bold.
 */

const BULLET_LINE = /^\s*(?:[-•*])\s+/;

export interface ParsedLetter {
  greeting: string | null;
  blocks: Array<
    { kind: "paragraph"; text: string } | { kind: "bullets"; items: string[] }
  >;
  signoff: string | null;
}

function splitBlocks(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);
}

function looksLikeSignoff(line: string): boolean {
  return /,$/.test(line) && line.split(/\s+/).length <= 5;
}

export function parseCoverLetter(text: string, name: string): ParsedLetter {
  const blocks = splitBlocks(text);
  const normalizedName = name.trim().toLowerCase();
  let greeting: string | null = null;
  let signoff: string | null = null;

  const first = blocks[0];
  if (
    first &&
    first.length === 1 &&
    !BULLET_LINE.test(first[0]) &&
    first[0].length <= 80 &&
    blocks.length > 1
  ) {
    greeting = first[0];
    blocks.shift();
  }

  // Trailing "Best,\nOwen Brown" (or either line alone).
  const last = blocks.at(-1);
  if (last && blocks.length > 0) {
    const lines = [...last];
    if (
      normalizedName &&
      lines.length > 0 &&
      lines.at(-1)?.toLowerCase() === normalizedName
    ) {
      lines.pop();
    }
    if (lines.length === 1 && looksLikeSignoff(lines[0])) {
      signoff = lines[0];
      lines.pop();
    }
    if (lines.length === 0) blocks.pop();
    else blocks[blocks.length - 1] = lines;
  }

  const out: ParsedLetter["blocks"] = [];
  for (const lines of blocks) {
    let paragraph: string[] = [];
    let bullets: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length)
        out.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    };
    const flushBullets = () => {
      if (bullets.length) out.push({ kind: "bullets", items: bullets });
      bullets = [];
    };
    for (const line of lines) {
      if (BULLET_LINE.test(line)) {
        flushParagraph();
        bullets.push(line.replace(BULLET_LINE, ""));
      } else if (bullets.length) {
        // A wrapped bullet line continues the previous bullet.
        bullets[bullets.length - 1] += ` ${line}`;
      } else {
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushBullets();
  }

  return { greeting, blocks: out, signoff };
}

/** Escapes text for LaTeX and turns **bold** into \textbf{bold}. */
export function inlineLatex(text: string): string {
  // The shared escaper trims its input, so bold goes through as <strong>
  // (which it already turns into \textbf) to keep the spaces around it.
  return escapeForCommand(
    text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
  );
}

export function formatLetterDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone || "America/Toronto",
  }).format(date);
}

function buildLetterHeader(document: LatexResumeDocument): string {
  const email = document.contactItems.find((item) => item.kind === "email");
  const phone = document.contactItems.find((item) => item.kind === "phone");
  const profile =
    document.profileItems.find((item) =>
      /linkedin/i.test(`${item.network} ${item.url ?? ""}`),
    ) ?? document.profileItems[0];
  const website = document.contactItems.find(
    (item) => item.kind === "website" && item.url,
  );
  const linkUrl = profile?.url ?? website?.url ?? "";
  const linkText = linkUrl ? cleanUrlForDisplay(linkUrl) : "";
  const arg = (value: string | null | undefined) =>
    escapeForCommand(value ?? "");
  return `\\letterHeader{${arg(document.name)}}{${arg(document.location)}}{${arg(
    email?.text,
  )}}{${arg(phone?.text)}}{${arg(linkText)}}{${
    linkUrl ? escapeLatexUrl(linkUrl) : ""
  }}`;
}

export function buildCoverLetterBody(args: {
  document: LatexResumeDocument;
  text: string;
  date: Date;
  signatureFile: string | null;
}): string {
  const parsed = parseCoverLetter(args.text, args.document.name);
  const lines = [
    buildLetterHeader(args.document),
    `\\letterDate{${escapeForCommand(formatLetterDate(args.date, process.env.TZ))}}`,
  ];
  if (parsed.greeting) {
    lines.push(`\\letterGreeting{${inlineLatex(parsed.greeting)}}`);
  }
  for (const block of parsed.blocks) {
    if (block.kind === "paragraph") {
      lines.push(`\\letterParagraph{${inlineLatex(block.text)}}`);
    } else {
      lines.push("\\letterBulletListStart");
      for (const item of block.items) {
        lines.push(`\\letterBullet{${inlineLatex(item)}}`);
      }
      lines.push("\\letterBulletListEnd");
    }
  }
  lines.push(
    `\\letterSignoff{${parsed.signoff ? inlineLatex(parsed.signoff) : ""}}{${escapeForCommand(
      args.document.name,
    )}}{${args.signatureFile ?? ""}}`,
  );
  return lines.join("\n");
}

export function fillCoverLetterTemplate(
  template: string,
  body: string,
  appendPdfFile: string | null,
): string {
  // Function replacers: "$" in letter text must not be read as a pattern.
  return template
    .replace("__BODY__", () => body)
    .replace("__APPEND_PDF__", () =>
      appendPdfFile ? `\\includepdf[pages=-]{${appendPdfFile}}` : "",
    );
}

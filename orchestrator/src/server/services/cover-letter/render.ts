import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import { loadBaseResumeDocument } from "../pdf";
import { resolveTemplatePath, runTectonic } from "../resume-renderer/latex";
import { buildCoverLetterBody, fillCoverLetterTemplate } from "./format";

const TEMPLATE_PATH = resolveTemplatePath("cover-letter.tex");
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

export function getSignaturePath(): string {
  return join(getDataDir(), "cover-letter", "signature.png");
}

export function hasSignature(): boolean {
  return existsSync(getSignaturePath());
}

/** Saves a PNG signature (base64) used under the letter's sign-off. */
export async function saveSignature(dataBase64: string): Promise<void> {
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > SIGNATURE_MAX_BYTES) {
    throw new Error("Signature must be a PNG under 2 MB.");
  }
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (!bytes.subarray(0, 4).equals(pngMagic)) {
    throw new Error("Signature must be a PNG image.");
  }
  const path = getSignaturePath();
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, bytes);
}

export async function removeSignature(): Promise<void> {
  await unlink(getSignaturePath()).catch(() => undefined);
}

/**
 * Compiles the letter to PDF bytes. With appendPdfPath, the resume pages
 * follow the letter (one file for single-attachment applications).
 */
export async function renderCoverLetterPdf(args: {
  jobId: string;
  text: string;
  appendPdfPath?: string | null;
}): Promise<Buffer> {
  const tempDir = await mkdtemp(
    join(tmpdir(), `job-ops-letter-${args.jobId}-`),
  );
  try {
    const document = await loadBaseResumeDocument();
    let signatureFile: string | null = null;
    if (hasSignature()) {
      await copyFile(getSignaturePath(), join(tempDir, "signature.png"));
      signatureFile = "signature.png";
    }
    let appendFile: string | null = null;
    if (args.appendPdfPath) {
      await copyFile(args.appendPdfPath, join(tempDir, "resume.pdf"));
      appendFile = "resume.pdf";
    }
    const body = buildCoverLetterBody({
      document,
      text: args.text,
      date: new Date(),
      signatureFile,
    });
    const tex = fillCoverLetterTemplate(
      await readFile(TEMPLATE_PATH, "utf8"),
      body,
      appendFile,
    );
    const texPath = join(tempDir, "letter.tex");
    await writeFile(texPath, tex, "utf8");
    await runTectonic({ cwd: tempDir, texPath, jobId: args.jobId });
    const pdf = await readFile(join(tempDir, "letter.pdf"));
    logger.info("Rendered cover letter PDF", {
      jobId: args.jobId,
      withResume: Boolean(appendFile),
      withSignature: Boolean(signatureFile),
    });
    return pdf;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

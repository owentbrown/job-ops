import { badRequest, forbidden, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import { setCoverLetter } from "@server/repositories/cover-letter";
import * as jobsRepo from "@server/repositories/jobs";
import { generateCoverLetter } from "@server/services/cover-letter/generate";
import { renderCoverLetterPdf } from "@server/services/cover-letter/render";
import { getPdfPath, pdfExists } from "@server/services/pdf";
import { safePdfFileName } from "@shared/filename-sanitizer";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const jobsCoverLetterRouter = Router();

const MAX_LETTER_CHARS = 20_000;

const saveSchema = z.object({
  text: z.string().max(MAX_LETTER_CHARS).nullable(),
});

const generateSchema = z.object({
  instructions: z.string().max(2000).optional().nullable(),
});

function handle(
  route: string,
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      const err =
        error instanceof z.ZodError
          ? badRequest(error.issues[0]?.message ?? "Invalid request")
          : toAppError(error);
      logger[err.status >= 500 ? "error" : "warn"](
        "Cover letter route failed",
        {
          route,
          jobId: req.params.id,
          status: err.status,
          code: err.code,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 300) : undefined,
        },
      );
      fail(res, err);
    }
  };
}

async function requireJobForLetter(id: string) {
  const job = await jobsRepo.getJobById(id);
  if (!job) throw notFound("Job not found");
  return job;
}

function letterFileName(
  employer: string,
  kind: "Cover_Letter" | "Application",
) {
  return safePdfFileName(`${kind}_${employer}`, { fallbackBase: kind });
}

function sendPdf(res: Response, bytes: Buffer, fileName: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
  );
  res.send(bytes);
}

jobsCoverLetterRouter.put(
  "/:id/cover-letter",
  handle("PUT /api/jobs/:id/cover-letter", async (req, res) => {
    if (isDemoMode())
      throw forbidden("Cover letters are disabled in demo mode.");
    const { text } = saveSchema.parse(req.body ?? {});
    const value = text?.trim() ? text.trim() : null;
    if (!(await setCoverLetter(req.params.id, value))) {
      throw notFound("Job not found");
    }
    ok(res, { id: req.params.id, coverLetter: value });
  }),
);

/** Drafts a letter with AI (one call). Not saved: the user reviews it first. */
jobsCoverLetterRouter.post(
  "/:id/cover-letter/generate",
  handle("POST /api/jobs/:id/cover-letter/generate", async (req, res) => {
    if (isDemoMode())
      throw forbidden("Cover letters are disabled in demo mode.");
    const { instructions } = generateSchema.parse(req.body ?? {});
    const job = await requireJobForLetter(req.params.id);
    if (!job.jobDescription?.trim()) {
      throw badRequest("This job has no description to write a letter from.");
    }
    const text = await generateCoverLetter(job, instructions);
    ok(res, { text });
  }),
);

jobsCoverLetterRouter.get(
  "/:id/cover-letter.pdf",
  handle("GET /api/jobs/:id/cover-letter.pdf", async (req, res) => {
    const job = await requireJobForLetter(req.params.id);
    if (!job.coverLetter?.trim()) throw notFound("Save a cover letter first.");
    const pdf = await renderCoverLetterPdf({
      jobId: job.id,
      text: job.coverLetter,
    });
    sendPdf(res, pdf, letterFileName(job.employer, "Cover_Letter"));
  }),
);

/** Letter first, then the resume: one file for single-attachment forms. */
jobsCoverLetterRouter.get(
  "/:id/application.pdf",
  handle("GET /api/jobs/:id/application.pdf", async (req, res) => {
    const job = await requireJobForLetter(req.params.id);
    if (!job.coverLetter?.trim()) throw notFound("Save a cover letter first.");
    if (!(await pdfExists(job.id))) {
      throw notFound("Generate the resume PDF first.");
    }
    const pdf = await renderCoverLetterPdf({
      jobId: job.id,
      text: job.coverLetter,
      appendPdfPath: getPdfPath(job.id),
    });
    sendPdf(res, pdf, letterFileName(job.employer, "Application"));
  }),
);

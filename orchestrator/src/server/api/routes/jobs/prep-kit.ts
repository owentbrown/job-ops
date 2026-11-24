/**
 * Prep kit ("Scan, dig, jot") routes:
 *
 *   GET    /api/jobs/:id/prep-kit                 kit + open jots
 *   POST   /api/jobs/:id/prep-kit/generate        AI drafts or refreshes the kit
 *   PUT    /api/jobs/:id/prep-kit                 save the user's edits
 *   POST   /api/jobs/:id/jots                     add a jot
 *   PATCH  /api/jobs/:id/jots/:jotId              edit a jot
 *   DELETE /api/jobs/:id/jots/:jotId              remove a jot
 *   POST   /api/jobs/:id/prep-kit/wrap-up         AI proposal (saves nothing)
 *   POST   /api/jobs/:id/prep-kit/wrap-up/apply   save note + kit, close jots
 */
import { badRequest, notFound, upstreamError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as prepKitsRepo from "@server/repositories/prep-kits";
import {
  generatePrepKit,
  proposeWrapUp,
  sanitizeKitContent,
} from "@server/services/prep-kit";
import type { PrepKitResponse } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { requireJob, toJobsRouteError } from "./shared";

export const jobsPrepKitRouter = Router();

const kitContentSchema = z.object({
  sections: z.array(z.unknown()).max(40),
  questions: z.array(z.unknown()).max(60),
});

const jotSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  sectionHint: z.string().trim().max(80).nullable().optional(),
});

const jotEditSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const applySchema = z.object({
  noteTitle: z.string().trim().min(1).max(120),
  noteContent: z.string().trim().min(1).max(20000),
  kit: kitContentSchema,
  jotIds: z.array(z.string().min(1).max(64)).max(500),
});

async function loadResponse(jobId: string): Promise<PrepKitResponse> {
  const [kit, jots] = await Promise.all([
    prepKitsRepo.getPrepKit(jobId),
    prepKitsRepo.listOpenJots(jobId),
  ]);
  return { kit, jots };
}

function failRoute(res: Response, route: string, error: unknown): void {
  const err = toJobsRouteError(error);
  logger.error("Prep kit route failed", {
    route,
    status: err.status,
    code: err.code,
    errorMessage: error instanceof Error ? error.message : undefined,
  });
  fail(res, err);
}

jobsPrepKitRouter.get("/:id/prep-kit", async (req: Request, res: Response) => {
  try {
    const job = await requireJob(req.params.id);
    ok(res, await loadResponse(job.id));
  } catch (error) {
    failRoute(res, "GET /api/jobs/:id/prep-kit", error);
  }
});

jobsPrepKitRouter.post(
  "/:id/prep-kit/generate",
  async (req: Request, res: Response) => {
    try {
      const job = await requireJob(req.params.id);
      const existing = await prepKitsRepo.getPrepKit(job.id);
      const result = await generatePrepKit(job, existing);
      if (!result.ok) return fail(res, upstreamError(result.error));
      await prepKitsRepo.savePrepKit(job.id, result.data);
      logger.info("Prep kit generated", {
        jobId: job.id,
        refreshed: Boolean(existing),
        sections: result.data.sections.length,
        questions: result.data.questions.length,
      });
      ok(res, await loadResponse(job.id));
    } catch (error) {
      failRoute(res, "POST /api/jobs/:id/prep-kit/generate", error);
    }
  },
);

jobsPrepKitRouter.put("/:id/prep-kit", async (req: Request, res: Response) => {
  try {
    const input = kitContentSchema.safeParse(req.body);
    if (!input.success) {
      return fail(res, badRequest("Invalid prep kit", input.error.flatten()));
    }
    const job = await requireJob(req.params.id);
    await prepKitsRepo.savePrepKit(job.id, sanitizeKitContent(input.data));
    ok(res, await loadResponse(job.id));
  } catch (error) {
    failRoute(res, "PUT /api/jobs/:id/prep-kit", error);
  }
});

jobsPrepKitRouter.post("/:id/jots", async (req: Request, res: Response) => {
  try {
    const input = jotSchema.safeParse(req.body);
    if (!input.success) {
      return fail(res, badRequest("Invalid jot", input.error.flatten()));
    }
    const job = await requireJob(req.params.id);
    const jot = await prepKitsRepo.createJot({
      jobId: job.id,
      text: input.data.text,
      sectionHint: input.data.sectionHint || null,
    });
    ok(res, jot, 201);
  } catch (error) {
    failRoute(res, "POST /api/jobs/:id/jots", error);
  }
});

jobsPrepKitRouter.patch(
  "/:id/jots/:jotId",
  async (req: Request, res: Response) => {
    try {
      const input = jotEditSchema.safeParse(req.body);
      if (!input.success) {
        return fail(res, badRequest("Invalid jot", input.error.flatten()));
      }
      const job = await requireJob(req.params.id);
      const jot = await prepKitsRepo.updateJot({
        jobId: job.id,
        jotId: req.params.jotId,
        text: input.data.text,
      });
      if (!jot) return fail(res, notFound("Jot not found"));
      ok(res, jot);
    } catch (error) {
      failRoute(res, "PATCH /api/jobs/:id/jots/:jotId", error);
    }
  },
);

jobsPrepKitRouter.delete(
  "/:id/jots/:jotId",
  async (req: Request, res: Response) => {
    try {
      const job = await requireJob(req.params.id);
      const deleted = await prepKitsRepo.deleteJot(job.id, req.params.jotId);
      if (deleted === 0) return fail(res, notFound("Jot not found"));
      ok(res, null);
    } catch (error) {
      failRoute(res, "DELETE /api/jobs/:id/jots/:jotId", error);
    }
  },
);

jobsPrepKitRouter.post(
  "/:id/prep-kit/wrap-up",
  async (req: Request, res: Response) => {
    try {
      const job = await requireJob(req.params.id);
      const [kit, jots] = await Promise.all([
        prepKitsRepo.getPrepKit(job.id),
        prepKitsRepo.listOpenJots(job.id),
      ]);
      if (jots.length === 0) {
        return fail(res, badRequest("There are no jots to wrap up yet."));
      }
      const result = await proposeWrapUp(job, kit, jots);
      if (!result.ok) return fail(res, upstreamError(result.error));
      ok(res, result.data);
    } catch (error) {
      failRoute(res, "POST /api/jobs/:id/prep-kit/wrap-up", error);
    }
  },
);

jobsPrepKitRouter.post(
  "/:id/prep-kit/wrap-up/apply",
  async (req: Request, res: Response) => {
    try {
      const input = applySchema.safeParse(req.body);
      if (!input.success) {
        return fail(res, badRequest("Invalid wrap-up", input.error.flatten()));
      }
      const job = await requireJob(req.params.id);
      const note = await jobsRepo.createJobNote({
        jobId: job.id,
        title: input.data.noteTitle,
        content: input.data.noteContent,
      });
      await prepKitsRepo.savePrepKit(
        job.id,
        sanitizeKitContent(input.data.kit),
      );
      await prepKitsRepo.markJotsWrappedUp(job.id, input.data.jotIds);
      logger.info("Prep kit wrap-up applied", {
        jobId: job.id,
        noteId: note.id,
        jots: input.data.jotIds.length,
      });
      ok(res, { ...(await loadResponse(job.id)), note });
    } catch (error) {
      failRoute(res, "POST /api/jobs/:id/prep-kit/wrap-up/apply", error);
    }
  },
);

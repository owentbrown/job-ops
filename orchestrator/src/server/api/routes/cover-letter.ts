import { badRequest, forbidden, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { isDemoMode } from "@server/config/demo";
import {
  getSignaturePath,
  hasSignature,
  removeSignature,
  saveSignature,
} from "@server/services/cover-letter/render";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

/** The signature image printed under the cover letter sign-off. */
export const coverLetterRouter = Router();

// Stored as a single server-wide file, so not offered in hosted mode.
coverLetterRouter.use((_req, res, next) => {
  if (getJobOpsAppConfig().appMode === "hosted") {
    fail(
      res,
      forbidden("Cover letter signatures are unavailable in hosted mode."),
    );
    return;
  }
  next();
});

const uploadSchema = z.object({ dataBase64: z.string().min(1) });

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
          ? badRequest("dataBase64 is required")
          : error instanceof Error && error.message.startsWith("Signature must")
            ? badRequest(error.message)
            : toAppError(error);
      logger.warn("Cover letter signature route failed", {
        route,
        status: err.status,
      });
      fail(res, err);
    }
  };
}

coverLetterRouter.get(
  "/signature",
  handle("GET /api/cover-letter/signature", async (_req, res) => {
    ok(res, { exists: hasSignature() });
  }),
);

coverLetterRouter.get(
  "/signature.png",
  handle("GET /api/cover-letter/signature.png", async (_req, res) => {
    if (!hasSignature()) {
      res.status(404).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(getSignaturePath());
  }),
);

coverLetterRouter.put(
  "/signature",
  handle("PUT /api/cover-letter/signature", async (req, res) => {
    if (isDemoMode()) throw forbidden("Disabled in demo mode.");
    const { dataBase64 } = uploadSchema.parse(req.body ?? {});
    await saveSignature(dataBase64);
    ok(res, { exists: true });
  }),
);

coverLetterRouter.delete(
  "/signature",
  handle("DELETE /api/cover-letter/signature", async (_req, res) => {
    if (isDemoMode()) throw forbidden("Disabled in demo mode.");
    await removeSignature();
    ok(res, { exists: false });
  }),
);

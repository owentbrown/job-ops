/** Overview dashboard data (fork: overview v2). */
import { badRequest, forbidden, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import {
  estimateBackfill,
  runBackfill,
} from "@server/services/overview/backfill";
import { computeOverview } from "@server/services/overview/compute";
import { loadOverviewInput } from "@server/services/overview/load";
import { OVERVIEW_RANGES, type OverviewRange } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const overviewRouter = Router();

const querySchema = z.object({
  range: z.coerce
    .number()
    .refine(
      (v): v is OverviewRange =>
        (OVERVIEW_RANGES as readonly number[]).includes(v),
      "range must be 7, 14, 30 or 90",
    )
    .default(30),
  tz: z
    .string()
    .max(100)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone")
    .default("UTC"),
});

overviewRouter.get("/", async (req: Request, res: Response) => {
  try {
    const q = querySchema.parse(req.query);
    const input = await loadOverviewInput({
      rangeDays: q.range as OverviewRange,
      timeZone: q.tz,
    });
    ok(res, computeOverview(input));
  } catch (error) {
    const err =
      error instanceof z.ZodError
        ? badRequest(error.issues.map((i) => i.message).join("; "))
        : toAppError(error);
    logger[err.status >= 500 ? "error" : "warn"]("Overview route failed", {
      status: err.status,
      code: err.code,
    });
    fail(res, err);
  }
});

const kindSchema = z.enum(["roles", "skips"], {
  message: "kind must be roles or skips",
});

function failWith(res: Response, error: unknown, what: string) {
  const err =
    error instanceof z.ZodError
      ? badRequest(error.issues.map((i) => i.message).join("; "))
      : toAppError(error);
  logger[err.status >= 500 ? "error" : "warn"](what, {
    status: err.status,
    code: err.code,
  });
  fail(res, err);
}

overviewRouter.get("/backfill", async (req: Request, res: Response) => {
  try {
    const kind = kindSchema.parse(req.query.kind);
    ok(res, await estimateBackfill(kind));
  } catch (error) {
    failWith(res, error, "Overview backfill estimate failed");
  }
});

overviewRouter.post("/backfill", async (req: Request, res: Response) => {
  try {
    const kind = kindSchema.parse(req.body?.kind);
    if (isDemoMode()) {
      throw forbidden("Categorizing is disabled in demo mode.");
    }
    ok(res, await runBackfill(kind));
  } catch (error) {
    failWith(res, error, "Overview backfill failed");
  }
});

import { asyncRoute, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getJobOpsAppStatus } from "@server/config/app-mode";
import type { Request, Response } from "express";
import { Router } from "express";

export const appStatusRouter = Router();

appStatusRouter.get(
  "/status",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, getJobOpsAppStatus());
  }),
);

const CRASH_FIELD_LIMIT = 4_000;
const CRASH_FIELDS = [
  "source",
  "name",
  "message",
  "stack",
  "componentStack",
  "route",
  "appVersion",
  "userAgent",
] as const;

function crashField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.slice(0, CRASH_FIELD_LIMIT);
}

/**
 * The browser's crash screen posts its details here so they land in the
 * server log (`docker logs job-ops`). The client already redacts secrets.
 */
appStatusRouter.post(
  "/client-crash",
  asyncRoute(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const crash: Record<string, string | null> = {};
    for (const field of CRASH_FIELDS) crash[field] = crashField(body[field]);
    logger.error("Client crash reported", { crash });
    ok(res, { logged: true });
  }),
);

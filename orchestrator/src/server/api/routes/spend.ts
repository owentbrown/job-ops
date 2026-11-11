/** AI spend report and price table (fork: spend). */
import { badRequest, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import {
  DEFAULT_MODEL_PRICES,
  getPriceTable,
  modelPriceSchema,
  savePriceTable,
} from "@server/services/spend/pricing";
import {
  buildSpendReport,
  getRunCosts,
  getSeenModels,
} from "@server/services/spend/report";
import type { SpendPricing } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const spendRouter = Router();

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
          ? badRequest(error.issues.map((i) => i.message).join("; "))
          : toAppError(error);
      logger[err.status >= 500 ? "error" : "warn"]("Spend route failed", {
        route,
        status: err.status,
        code: err.code,
      });
      fail(res, err);
    }
  };
}

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
  .optional();

const reportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
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
    .optional(),
});

spendRouter.get(
  "/",
  handle("GET /api/spend", async (req, res) => {
    const q = reportQuerySchema.parse(req.query);
    const report = await buildSpendReport({
      from: q.from ? new Date(q.from).toISOString() : null,
      to: q.to ? new Date(q.to).toISOString() : null,
      timeZone: q.tz ?? "UTC",
    });
    ok(res, report);
  }),
);

const runCostsQuerySchema = z.object({
  ids: z
    .string()
    .max(5000)
    .transform((v) => v.split(",").filter(Boolean).slice(0, 200)),
});

spendRouter.get(
  "/runs",
  handle("GET /api/spend/runs", async (req, res) => {
    const { ids } = runCostsQuerySchema.parse(req.query);
    ok(res, { costs: await getRunCosts(ids) });
  }),
);

async function pricingResponse(): Promise<SpendPricing> {
  const table = getPriceTable();
  return {
    models: table.models,
    defaults: DEFAULT_MODEL_PRICES,
    customized: table.customized,
    seenModels: await getSeenModels(),
  };
}

spendRouter.get(
  "/pricing",
  handle("GET /api/spend/pricing", async (_req, res) => {
    ok(res, await pricingResponse());
  }),
);

const savePricingSchema = z.object({
  models: z.record(z.string().trim().min(1).max(200), modelPriceSchema),
});

spendRouter.put(
  "/pricing",
  handle("PUT /api/spend/pricing", async (req, res) => {
    const { models } = savePricingSchema.parse(req.body ?? {});
    await savePriceTable(models);
    ok(res, await pricingResponse());
  }),
);

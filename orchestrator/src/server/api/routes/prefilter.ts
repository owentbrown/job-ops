import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  toAppError,
} from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { isDemoMode } from "@server/config/demo";
import { getPipelineStatus, runPipeline } from "@server/pipeline/index";
import * as jobsRepo from "@server/repositories/jobs";
import * as prefilterRepo from "@server/repositories/prefilter";
import {
  formatConfigError,
  parsePrefilterConfig,
  readPrefilterConfig,
  writePrefilterConfig,
} from "@server/services/prefilter/config";
import { previewRules } from "@server/services/prefilter/preview";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const prefilterRouter = Router();

function getRequestId(res: Response): string {
  return String(res.getHeader("x-request-id") || "unknown");
}

function requireConfigBody(req: Request): unknown {
  const config = req.body?.config;
  if (config === undefined || config === null) {
    throw badRequest("config is required");
  }
  return config;
}

// The rules file is global to the server, so it is never exposed in hosted mode.
prefilterRouter.use((_req, res, next) => {
  if (getJobOpsAppConfig().appMode === "hosted") {
    fail(res, forbidden("Pre-score filter is unavailable in hosted mode."));
    return;
  }
  next();
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
          ? badRequest(formatConfigError(error))
          : toAppError(error);
      logger[err.status >= 500 ? "error" : "warn"]("Prefilter route failed", {
        route,
        requestId: getRequestId(res),
        status: err.status,
        code: err.code,
      });
      fail(res, err);
    }
  };
}

prefilterRouter.get(
  "/jobs",
  handle("GET /api/prefilter/jobs", async (_req, res) => {
    ok(res, { jobs: await prefilterRepo.listFilteredJobs() });
  }),
);

prefilterRouter.post(
  "/jobs/:id/restore",
  handle("POST /api/prefilter/jobs/:id/restore", async (req, res) => {
    if (isDemoMode()) {
      throw forbidden("Restoring jobs is disabled in demo mode.");
    }
    if (!(await prefilterRepo.restoreFilteredJob(req.params.id))) {
      throw notFound("Filtered job not found");
    }
    logger.info("Prefiltered job restored", {
      jobId: req.params.id,
      requestId: getRequestId(res),
    });
    ok(res, { id: req.params.id, restored: true });
  }),
);

prefilterRouter.get(
  "/config",
  handle("GET /api/prefilter/config", async (_req, res) => {
    const load = await readPrefilterConfig();
    ok(res, {
      status: load.status,
      path: "path" in load ? load.path : null,
      config: load.status === "ok" ? load.config : null,
      error: load.status === "invalid" ? load.error : null,
      defaults: parsePrefilterConfig({}),
    });
  }),
);

prefilterRouter.put(
  "/config",
  handle("PUT /api/prefilter/config", async (req, res) => {
    if (isDemoMode()) {
      throw forbidden("Saving filter rules is disabled in demo mode.");
    }
    const saved = await writePrefilterConfig(requireConfigBody(req));
    logger.info("Prefilter config saved", {
      path: saved.path,
      requestId: getRequestId(res),
    });
    ok(res, saved);
  }),
);

prefilterRouter.post(
  "/preview",
  handle("POST /api/prefilter/preview", async (req, res) => {
    const config = parsePrefilterConfig(requireConfigBody(req));
    const jobs = (await jobsRepo.getUnscoredDiscoveredJobs()).filter(
      (job) => job.filterLayer !== "restored" && job.source !== "manual",
    );
    ok(res, previewRules(jobs, config));
  }),
);

const recheckBodySchema = z.object({ apply: z.boolean().default(false) });
const skipReasonBodySchema = z.object({
  reason: z.string().trim().max(1000).nullable(),
});

/**
 * Runs the saved rules (no AI, no cost) over jobs that were already scored
 * and are still waiting in Discovered. apply=false lists what would move;
 * apply=true moves those jobs to Filtered (restorable).
 */
prefilterRouter.post(
  "/recheck-scored",
  handle("POST /api/prefilter/recheck-scored", async (req, res) => {
    const { apply } = recheckBodySchema.parse(req.body ?? {});
    if (apply && isDemoMode()) {
      throw forbidden("Re-checking jobs is disabled in demo mode.");
    }
    if (apply && getPipelineStatus().isRunning) {
      throw conflict("Wait for the current run to finish first.");
    }
    const load = await readPrefilterConfig();
    if (load.status !== "ok") {
      throw badRequest(
        load.status === "invalid"
          ? `Filter rules are invalid: ${load.error}`
          : "No filter rules saved yet. Save your rules first.",
      );
    }
    const jobs = (await jobsRepo.getAllJobs(["discovered"])).filter(
      (job) =>
        job.suitabilityScore !== null &&
        job.suitabilityScore !== undefined &&
        job.filterLayer !== "restored" &&
        job.source !== "manual",
    );
    const preview = previewRules(jobs, load.config, jobs.length);
    const drops = preview.items.filter((item) => item.decision === "drop");
    let moved = 0;
    if (apply) {
      for (const item of drops) {
        if (
          await prefilterRepo.markJobFiltered({
            id: item.id,
            layer: "rules",
            reason: item.detail,
          })
        ) {
          moved += 1;
        }
      }
      logger.info("Scored jobs re-checked with rules", {
        checked: jobs.length,
        moved,
        requestId: getRequestId(res),
      });
    }
    ok(res, { checked: jobs.length, drops, moved });
  }),
);

prefilterRouter.put(
  "/jobs/:id/skip-reason",
  handle("PUT /api/prefilter/jobs/:id/skip-reason", async (req, res) => {
    if (isDemoMode()) {
      throw forbidden("Saving skip reasons is disabled in demo mode.");
    }
    const { reason } = skipReasonBodySchema.parse(req.body ?? {});
    const value = reason ? reason : null;
    if (!(await prefilterRepo.setSkipReason(req.params.id, value))) {
      throw notFound("Skipped job not found");
    }
    ok(res, { id: req.params.id, skipReason: value });
  }),
);

prefilterRouter.post(
  "/score-backlog",
  handle("POST /api/prefilter/score-backlog", async (_req, res) => {
    if (isDemoMode()) {
      throw forbidden("Backlog scoring is disabled in demo mode.");
    }
    if (getPipelineStatus().isRunning) {
      throw conflict("Pipeline is already running");
    }
    const load = await readPrefilterConfig();
    if (load.status === "missing") {
      throw badRequest("No filter rules saved yet. Save your rules first.");
    }
    if (load.status === "invalid") {
      throw badRequest(`Filter rules are invalid: ${load.error}`);
    }
    runWithRequestContext({}, () => {
      runPipeline(
        {
          enableCrawling: false,
          enableImporting: false,
          enableAutoTailoring: false,
        },
        { skipPrefilterReview: true },
      ).catch((error) => {
        logger.error("Backlog scoring run failed", {
          error:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
      });
    });
    logger.info("Backlog scoring run started", {
      requestId: getRequestId(res),
    });
    ok(res, { started: true });
  }),
);

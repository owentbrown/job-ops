import { badRequest, conflict, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
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
        requestId: String(res.getHeader("x-request-id") || "unknown"),
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
    if (!(await prefilterRepo.restoreFilteredJob(req.params.id))) {
      throw notFound("Filtered job not found");
    }
    logger.info("Prefiltered job restored", { jobId: req.params.id });
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
    const saved = await writePrefilterConfig(req.body?.config);
    logger.info("Prefilter config saved", { path: saved.path });
    ok(res, saved);
  }),
);

prefilterRouter.post(
  "/preview",
  handle("POST /api/prefilter/preview", async (req, res) => {
    const config = parsePrefilterConfig(req.body?.config);
    const jobs = (await jobsRepo.getUnscoredDiscoveredJobs()).filter(
      (job) => job.filterLayer !== "restored",
    );
    ok(res, previewRules(jobs, config));
  }),
);

prefilterRouter.post(
  "/score-backlog",
  handle("POST /api/prefilter/score-backlog", async (_req, res) => {
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
    ok(res, { started: true });
  }),
);

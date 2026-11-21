import { serviceUnavailable, upstreamError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import * as companyChecksRepo from "@server/repositories/company-checks";
import {
  getCompanyCheckUnavailableReason,
  runCompanyCheck,
} from "@server/services/company-check";
import {
  buildReviewLinks,
  pickIndeedFacts,
} from "@server/services/company-info";
import { normalizeCompanyName } from "@shared/job-matching";
import type { CompanyInfoResponse, Job } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { requireJob, toJobsRouteError } from "./shared";

export const jobsCompanyRouter = Router();

function employerKey(job: Pick<Job, "employer">): string {
  return normalizeCompanyName(job.employer ?? "") || job.employer.trim();
}

async function buildCompanyInfo(job: Job): Promise<CompanyInfoResponse> {
  const [ratedRows, check, checkUnavailableReason] = await Promise.all([
    companyChecksRepo.getRatedCompanyRows(),
    companyChecksRepo.getCompanyCheck(employerKey(job)),
    getCompanyCheckUnavailableReason(),
  ]);
  const indeed = pickIndeedFacts(job.employer, ratedRows);
  return {
    employer: job.employer,
    indeed,
    links: buildReviewLinks(job.employer, indeed),
    check,
    checkUnavailableReason,
  };
}

/** Free company facts (Indeed rating, review links) plus any cached check. */
jobsCompanyRouter.get("/:id/company", async (req: Request, res: Response) => {
  try {
    const job = await requireJob(req.params.id);
    ok(res, await buildCompanyInfo(job));
  } catch (error) {
    fail(res, toJobsRouteError(error));
  }
});

/**
 * Runs (or re-runs) the paid AI company check for this job's employer and
 * caches it. Costs a few cents, so the client only calls it on a click.
 */
jobsCompanyRouter.post(
  "/:id/company/check",
  async (req: Request, res: Response) => {
    try {
      const job = await requireJob(req.params.id);
      const unavailable = await getCompanyCheckUnavailableReason();
      if (unavailable) {
        fail(res, serviceUnavailable(unavailable));
        return;
      }

      const ratedRows = await companyChecksRepo.getRatedCompanyRows();
      const indeed = pickIndeedFacts(job.employer, ratedRows);
      const result = await runCompanyCheck({
        employer: job.employer,
        jobTitle: job.title,
        location: job.location,
        website: indeed?.website ?? null,
        jobId: job.id,
      });
      if (!result.ok) {
        fail(res, upstreamError(result.error));
        return;
      }

      await companyChecksRepo.saveCompanyCheck(employerKey(job), result.check);
      logger.info("Company check completed", {
        jobId: job.id,
        searches: result.check.searches,
        costUsd: result.check.costUsd,
      });
      ok(res, await buildCompanyInfo(job));
    } catch (error) {
      fail(res, toJobsRouteError(error));
    }
  },
);

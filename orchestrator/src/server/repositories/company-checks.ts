import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import type { CompanyCheck } from "@shared/types";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../db/index";
import {
  getPrivateDataScope,
  privateDataScopeFilter,
} from "../tenancy/private-scope";

const { companyChecks, jobs } = schema;

/**
 * Company checks describe public facts about an employer, so they are shared
 * across the tenant rather than kept per user.
 */
function tenantId(): string {
  return getPrivateDataScope().tenantId;
}

export async function getCompanyCheck(
  employerKey: string,
): Promise<CompanyCheck | null> {
  const [row] = await db
    .select({ payload: companyChecks.payload })
    .from(companyChecks)
    .where(
      and(
        eq(companyChecks.tenantId, tenantId()),
        eq(companyChecks.employerKey, employerKey),
      ),
    );
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as CompanyCheck;
  } catch (error) {
    logger.warn("Ignoring unreadable cached company check", {
      employerKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveCompanyCheck(
  employerKey: string,
  check: CompanyCheck,
): Promise<void> {
  const payload = JSON.stringify(check);
  await db
    .insert(companyChecks)
    .values({
      id: randomUUID(),
      tenantId: tenantId(),
      employerKey,
      payload,
      createdAt: check.checkedAt,
    })
    .onConflictDoUpdate({
      target: [companyChecks.tenantId, companyChecks.employerKey],
      set: { payload, createdAt: check.checkedAt },
    });
}

export type IndeedCompanyRow = {
  employer: string;
  companyRating: number;
  companyReviewsCount: number | null;
  employerUrl: string | null;
  companyUrlDirect: string | null;
  companyNumEmployees: string | null;
  companyIndustry: string | null;
  discoveredAt: string;
};

/** Saved jobs that carry an Indeed company rating (mostly Indeed listings). */
export async function getRatedCompanyRows(): Promise<IndeedCompanyRow[]> {
  const rows = await db
    .select({
      employer: jobs.employer,
      companyRating: jobs.companyRating,
      companyReviewsCount: jobs.companyReviewsCount,
      employerUrl: jobs.employerUrl,
      companyUrlDirect: jobs.companyUrlDirect,
      companyNumEmployees: jobs.companyNumEmployees,
      companyIndustry: jobs.companyIndustry,
      discoveredAt: jobs.discoveredAt,
    })
    .from(jobs)
    .where(and(privateDataScopeFilter(jobs), isNotNull(jobs.companyRating)));

  return rows.flatMap((row) =>
    typeof row.companyRating === "number"
      ? [
          {
            ...row,
            companyRating: row.companyRating,
            companyReviewsCount: row.companyReviewsCount ?? null,
            employerUrl: row.employerUrl ?? null,
            companyUrlDirect: row.companyUrlDirect ?? null,
            companyNumEmployees: row.companyNumEmployees ?? null,
            companyIndustry: row.companyIndustry ?? null,
          },
        ]
      : [],
  );
}

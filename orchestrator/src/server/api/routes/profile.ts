import { type AppError, badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import { DEMO_PROJECT_CATALOG } from "@server/config/demo-defaults";
import {
  createStory,
  deleteStory,
  updateStory,
  upsertSingleton,
} from "@server/repositories/profile-entries";
import { getDesignResumeStatus } from "@server/services/design-resume";
import { clearProfileCache, getProfile } from "@server/services/profile";
import { writeProfileDraft } from "@server/services/profile/ai-write";
import { computeProfileInsights } from "@server/services/profile/compute";
import {
  loadProfileEntries,
  loadProfileInsightsInput,
} from "@server/services/profile/load";
import { refreshProfileSkills } from "@server/services/profile/skills-refresh";
import { extractProjectsFromProfile } from "@server/services/resumeProjects";
import {
  clearRxResumeResumeCache,
  getResume,
  RxResumeAuthConfigError,
} from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import {
  ProfileAiWriteRequestSchema,
  type ProfileEntriesResponse,
  ProfileSingletonKindSchema,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const profileRouter = Router();

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
profileRouter.get("/projects", async (_req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      ok(res, DEMO_PROJECT_CATALOG);
      return;
    }
    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    ok(res, catalog);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile - Get the full base resume profile
 */
profileRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile/status - Check if base resume is configured and accessible
 */
profileRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const localStatus = await getDesignResumeStatus();
    if (localStatus.exists) {
      ok(res, { exists: true, error: null });
      return;
    }

    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      ok(res, {
        exists: false,
        error:
          "No base resume selected. Please select a resume from your Reactive Resume account in Settings.",
      });
      return;
    }

    // Verify the resume is accessible
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (!resume.data || typeof resume.data !== "object") {
        ok(res, {
          exists: false,
          error: "Selected resume is empty or invalid.",
        });
        return;
      }

      ok(res, { exists: true, error: null });
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        ok(res, { exists: false, error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    ok(res, { exists: false, error: message });
  }
});

/**
 * POST /api/profile/refresh - Clear profile cache and refetch from Reactive Resume
 */
profileRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    clearProfileCache();
    clearRxResumeResumeCache();
    const profile = await getProfile(true);
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

// ---------------------------------------------------------------------------
// About you: insights and profile entries
// ---------------------------------------------------------------------------

/** Name-based, so a ZodError from the shared package's zod copy still counts. */
function isZodError(error: unknown): error is z.ZodError {
  return (
    error instanceof z.ZodError ||
    (error instanceof Error &&
      error.name === "ZodError" &&
      Array.isArray((error as { issues?: unknown }).issues))
  );
}

/** Zod failures become a 400 with a readable message; the rest as usual. */
function profileError(error: unknown, label: string): AppError {
  const err = isZodError(error)
    ? badRequest(
        error.issues
          .map(
            (i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message,
          )
          .join("; "),
        { issues: error.issues },
      )
    : toAppError(error);
  logger[err.status >= 500 ? "error" : "warn"](label, {
    status: err.status,
    code: err.code,
  });
  return err;
}

/**
 * GET /api/profile/insights - computed About you insights
 */
profileRouter.get("/insights", async (_req: Request, res: Response) => {
  try {
    ok(res, computeProfileInsights(await loadProfileInsightsInput()));
  } catch (error) {
    fail(res, profileError(error, "Profile insights failed"));
  }
});

/**
 * GET /api/profile/entries - every saved profile entry for this user
 */
profileRouter.get("/entries", async (_req: Request, res: Response) => {
  try {
    const { singletonsUpdatedAt: _ignored, ...entries } =
      await loadProfileEntries();
    const body: ProfileEntriesResponse = entries;
    ok(res, body);
  } catch (error) {
    fail(res, profileError(error, "Profile entries read failed"));
  }
});

/**
 * PUT /api/profile/entries/:kind - upsert a singleton (brand, pitch, values,
 * skills). Stories use the /stories routes.
 */
profileRouter.put("/entries/:kind", async (req: Request, res: Response) => {
  try {
    const kind = ProfileSingletonKindSchema.safeParse(req.params.kind);
    if (!kind.success) {
      throw badRequest(
        req.params.kind === "story"
          ? "Stories are saved through /api/profile/stories."
          : `Unknown profile entry kind: ${req.params.kind}`,
      );
    }
    ok(res, await upsertSingleton(kind.data, req.body));
  } catch (error) {
    fail(res, profileError(error, "Profile entry save failed"));
  }
});

/**
 * POST /api/profile/stories - create a story
 */
profileRouter.post("/stories", async (req: Request, res: Response) => {
  try {
    ok(res, await createStory(req.body), 201);
  } catch (error) {
    fail(res, profileError(error, "Profile story create failed"));
  }
});

/**
 * PUT /api/profile/stories/:id - replace a story
 */
profileRouter.put("/stories/:id", async (req: Request, res: Response) => {
  try {
    const row = await updateStory(req.params.id, req.body);
    if (!row) throw notFound("Story not found");
    ok(res, row);
  } catch (error) {
    fail(res, profileError(error, "Profile story update failed"));
  }
});

/**
 * DELETE /api/profile/stories/:id - delete a story
 */
profileRouter.delete("/stories/:id", async (req: Request, res: Response) => {
  try {
    if (!(await deleteStory(req.params.id))) throw notFound("Story not found");
    ok(res, { deleted: true });
  } catch (error) {
    fail(res, profileError(error, "Profile story delete failed"));
  }
});

/**
 * POST /api/profile/skills/refresh - AI skill extraction from best-fit jobs.
 * 409 while one is already running for this user; 502 when the model fails
 * (stored skills are left unchanged).
 */
profileRouter.post("/skills/refresh", async (_req: Request, res: Response) => {
  try {
    ok(res, await refreshProfileSkills());
  } catch (error) {
    fail(res, profileError(error, "Profile skill refresh failed"));
  }
});

/**
 * POST /api/profile/ai/write - AI draft for the pitch, a story, values or the
 * brand line. Returns the draft only; nothing is saved. 400 on a bad body,
 * 502 when the model fails.
 */
profileRouter.post("/ai/write", async (req: Request, res: Response) => {
  try {
    const request = ProfileAiWriteRequestSchema.parse(req.body ?? {});
    ok(res, await writeProfileDraft(request));
  } catch (error) {
    fail(res, profileError(error, "Profile AI writing failed"));
  }
});

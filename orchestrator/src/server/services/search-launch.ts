/**
 * Starting a search ("Find jobs") outside of the HTTP handler, so the same
 * validation + launch path serves the button, "Run last search again" and the
 * daily scheduled search.
 */
import { badRequest, conflict, serviceUnavailable } from "@infra/errors";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { isDemoMode } from "@server/config/demo";
import {
  type ExtractorRegistry,
  getExtractorRegistry,
} from "@server/extractors/registry";
import { getPipelineStatus, runPipeline } from "@server/pipeline/index";
import { simulatePipelineRun } from "@server/services/demo-simulator";
import { reserveHostedUsage } from "@server/services/hosted-usage";
import { ensurePipelineSearchTerms } from "@server/services/pipeline-search-terms";
import { PIPELINE_EXTRACTOR_SOURCE_IDS } from "@shared/extractors";
import {
  createLocationIntent,
  planLocationSources,
} from "@shared/location-intelligence.js";
import {
  LOCATION_MATCH_STRICTNESS_VALUES,
  LOCATION_SEARCH_SCOPE_VALUES,
} from "@shared/location-preferences.js";
import {
  MAX_PIPELINE_RUN_BUDGET,
  normalizePipelineRunBudget,
} from "@shared/types";
import { z } from "zod";

export const WORKPLACE_TYPE_VALUES = ["remote", "hybrid", "onsite"] as const;
export const pipelineSourceSchema = z.enum(
  PIPELINE_EXTRACTOR_SOURCE_IDS as [
    (typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number],
    ...(typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number][],
  ],
);
export const pipelineRunBudgetSchema = z
  .number()
  .int()
  .max(MAX_PIPELINE_RUN_BUDGET)
  .transform(normalizePipelineRunBudget);

export const runPipelineSchema = z.object({
  topN: z.number().min(1).max(50).optional(),
  minSuitabilityScore: z.number().min(0).max(100).optional(),
  sources: z.array(pipelineSourceSchema).min(1).optional(),
  runBudget: pipelineRunBudgetSchema.optional(),
  searchTerms: z.array(z.string().trim().min(1)).optional(),
  scoringInstructions: z.string().trim().max(4000).optional(),
  country: z.string().trim().optional(),
  cityLocations: z.array(z.string().trim().min(1)).optional(),
  proximity: z
    .object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      radiusMiles: z.number().int().min(1).max(200),
    })
    .nullable()
    .optional(),
  workplaceTypes: z
    .array(z.enum(WORKPLACE_TYPE_VALUES))
    .min(1)
    .max(3)
    .optional(),
  searchScope: z.enum(LOCATION_SEARCH_SCOPE_VALUES).optional(),
  matchStrictness: z.enum(LOCATION_MATCH_STRICTNESS_VALUES).optional(),
  // Per-#621: optional client-supplied per-run Watchlist source filter.
  // Omitted preserves the legacy "include every saved Watchlist source"
  // behavior; [] disables Watchlist entirely; non-empty restricts to a
  // subset. Cross-tenant safety is enforced by re-resolving IDs against
  // the user's saved Watchlist sources inside discoverJobsStep.
  watchlistSelectedSourceIds: z.array(z.string().min(1).max(128)).optional(),
});

export type RunPipelineRequest = z.infer<typeof runPipelineSchema>;

export type LaunchSearchResult =
  | { simulated: true; data: unknown }
  | {
      simulated: false;
      searchTermsState: Awaited<ReturnType<typeof ensurePipelineSearchTerms>>;
    };

/**
 * Validate and start a search in the background. Throws AppError on bad input
 * or when a search is already running.
 */
export async function launchSearch(
  config: RunPipelineRequest,
  options?: {
    /** Unattended daily run: no review pause, no challenge pause, capped scoring. */
    scheduled?: { maxJobsToScore: number };
    /**
     * Replays of an earlier search: drop saved sources that no longer fit the
     * location setup instead of refusing the whole run.
     */
    dropIncompatibleSources?: boolean;
  },
): Promise<LaunchSearchResult> {
  const locationIntent = createLocationIntent({
    selectedCountry: config.country,
    cityLocations: config.cityLocations,
    proximity: config.proximity,
    workplaceTypes: config.workplaceTypes,
    geoScope: config.searchScope,
    matchStrictness: config.matchStrictness,
  });

  let sources = config.sources;
  if (sources && sources.length > 0) {
    let registry: ExtractorRegistry;
    try {
      registry = await getExtractorRegistry();
    } catch (error) {
      logger.error("Extractor registry unavailable during source validation", {
        route: "launchSearch",
        error,
      });
      throw serviceUnavailable(
        "Extractor registry is unavailable. Try again after fixing startup errors.",
      );
    }
    const unavailableSources = sources.filter(
      (source) => !registry.manifestBySource.has(source),
    );
    if (unavailableSources.length > 0) {
      throw badRequest(
        `Requested sources are not available at runtime: ${unavailableSources.join(", ")}`,
        { unavailableSources },
      );
    }

    const sourcePlans = planLocationSources({
      intent: locationIntent,
      sources,
      capabilitiesBySource: registry.locationCapabilitiesBySource ?? {},
    });
    if (sourcePlans.incompatibleSources.length > 0) {
      // A repeat of an older search shouldn't fail because one saved source
      // no longer fits; run the ones that still do.
      if (options?.dropIncompatibleSources) {
        sources = sources.filter(
          (source) => !sourcePlans.incompatibleSources.includes(source),
        );
        if (sources.length === 0) {
          throw badRequest(
            "None of the saved sources work with the saved location setup",
          );
        }
      } else {
        const incompatible = sourcePlans.plans
          .filter((plan) => !plan.isCompatible)
          .map((plan) => ({ source: plan.source, reasons: plan.reasons }));
        throw badRequest(
          "Requested sources are incompatible with the selected location setup",
          { incompatibleSources: incompatible },
        );
      }
    }
  }

  if (isDemoMode()) {
    const data = await simulatePipelineRun({
      topN: config.topN,
      minSuitabilityScore: config.minSuitabilityScore,
      sources,
      scoringInstructions: config.scoringInstructions,
      locationIntent,
    });
    return { simulated: true, data };
  }

  if (getPipelineStatus().isRunning) {
    throw conflict("Pipeline is already running");
  }

  const searchTermsState = await ensurePipelineSearchTerms({
    requestedSearchTerms: config.searchTerms,
  });
  const pipelineUsage = await reserveHostedUsage({ action: "pipeline_run" });

  runWithRequestContext({}, () => {
    runPipeline(
      {
        topN: config.topN,
        minSuitabilityScore: config.minSuitabilityScore,
        sources,
        scoringInstructions: config.scoringInstructions,
        runBudget: config.runBudget,
        locationIntent,
        watchlistSelectedSourceIds: config.watchlistSelectedSourceIds,
      },
      {
        hostedUsageReservationId: pipelineUsage.reservation?.id ?? null,
        ...(options?.scheduled
          ? {
              nonInteractive: true,
              skipChallenges: true,
              maxJobsToScore: options.scheduled.maxJobsToScore,
            }
          : {}),
      },
    ).catch((error) => {
      logger.error("Background pipeline run failed", error);
    });
  });

  return { simulated: false, searchTermsState };
}

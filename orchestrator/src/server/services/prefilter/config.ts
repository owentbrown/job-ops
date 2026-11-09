import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "@infra/logger";
import { z } from "zod";

const comment = { _comment: z.string().optional() };
const keywordList = z.array(z.string().trim().min(1)).default([]);

export const prefilterConfigSchema = z
  .object({
    ...comment,
    enabled: z.boolean().default(true),
    pauseBeforeScoring: z.boolean().default(true),
    title: z
      .object({ ...comment, include: keywordList, exclude: keywordList })
      .strict()
      .default({}),
    companyBlocklist: keywordList,
    location: z
      .object({ ...comment, commuteBlocklist: keywordList })
      .strict()
      .default({}),
    salary: z
      .object({
        ...comment,
        enabled: z.boolean().default(true),
        floorAnnualCad: z.number().positive().default(110000),
        hoursPerYear: z.number().positive().default(2080),
        defaultCurrency: z.string().trim().toUpperCase().default("CAD"),
        ratesToCad: z
          .record(z.string(), z.number().positive())
          .transform((rates) =>
            Object.fromEntries(
              Object.entries(rates).map(([code, rate]) => [
                code.trim().toUpperCase(),
                rate,
              ]),
            ),
          )
          .default({ CAD: 1 }),
      })
      .strict()
      .superRefine((salary, ctx) => {
        if (!(salary.defaultCurrency in salary.ratesToCad)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["defaultCurrency"],
            message: `ratesToCad must include a rate for ${salary.defaultCurrency}`,
          });
        }
      })
      .default({}),
    description: z
      .object({
        ...comment,
        hardDropPhrases: keywordList,
        flagPhrases: keywordList,
      })
      .strict()
      .default({}),
    llm: z
      .object({
        ...comment,
        enabled: z.boolean().default(false),
        batchSize: z.number().int().min(1).max(50).default(20),
        descriptionChars: z.number().int().min(0).max(2000).default(400),
        model: z.string().trim().min(1).nullable().default(null),
        targetRoles: z.string().trim().default(""),
        hardPasses: z.string().trim().default(""),
      })
      .strict()
      .default({}),
  })
  .strict();

export type PrefilterConfig = z.infer<typeof prefilterConfigSchema>;

export function parsePrefilterConfig(raw: unknown): PrefilterConfig {
  return prefilterConfigSchema.parse(raw);
}

export type PrefilterConfigLoad =
  | { status: "ok"; config: PrefilterConfig; path: string }
  | { status: "off-in-tests" }
  | { status: "missing"; path: string }
  | { status: "invalid"; path: string; error: string };

export function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

function defaultPrefilterConfigPath(): string {
  // cwd is orchestrator/ natively and /app/orchestrator in Docker.
  return resolve(process.cwd(), "..", "config", "prefilter.json");
}

/**
 * PREFILTER_CONFIG_PATH wins. Otherwise <cwd>/../config/prefilter.json, or
 * <cwd>/config/prefilter.json if only that exists. Under NODE_ENV=test with no
 * explicit path this returns null, so existing pipeline tests see a no-op step
 * and tests can never write the real repo file.
 */
export function resolvePrefilterConfigPath(): string | null {
  const explicit = process.env.PREFILTER_CONFIG_PATH?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "test") return null;
  const primary = defaultPrefilterConfigPath();
  const secondary = resolve(process.cwd(), "config", "prefilter.json");
  return !existsSync(primary) && existsSync(secondary) ? secondary : primary;
}

export async function readPrefilterConfig(): Promise<PrefilterConfigLoad> {
  const path = resolvePrefilterConfigPath();
  if (!path) return { status: "off-in-tests" };
  if (!existsSync(path)) return { status: "missing", path };
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return { status: "ok", path, config: parsePrefilterConfig(raw) };
  } catch (error) {
    const message = formatConfigError(error);
    logger.error("Prefilter config invalid", { path, error: message });
    return { status: "invalid", path, error: message };
  }
}

/** Validates first, then writes via temp file + rename so a bad save never corrupts the file. */
export async function writePrefilterConfig(
  raw: unknown,
): Promise<{ config: PrefilterConfig; path: string }> {
  const config = parsePrefilterConfig(raw);
  const path = resolvePrefilterConfigPath();
  if (!path) {
    throw new Error("No prefilter config path; set PREFILTER_CONFIG_PATH");
  }
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return { config, path };
}

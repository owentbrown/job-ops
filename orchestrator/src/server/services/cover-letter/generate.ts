import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import type { Job } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import { getProfile } from "../profile";
import { filterProfileProjectsForAi } from "../resumeProjects";
import { getWritingStyle } from "../writing-style";

const SCHEMA: JsonSchemaDefinition = {
  name: "cover_letter",
  schema: {
    type: "object",
    properties: {
      letter: {
        type: "string",
        description:
          "The cover letter as plain text: greeting line, blank-line separated paragraphs, '- ' bullets with **bold** lead-ins. No date, address, sign-off or name.",
      },
    },
    required: ["letter"],
    additionalProperties: false,
  },
};

const MAX_DESCRIPTION_CHARS = 8000;

async function loadExampleLetter(): Promise<string> {
  const candidates = [
    join(fileURLToPath(new URL(".", import.meta.url)), "example-letter.txt"),
    join(process.cwd(), "src/server/services/cover-letter/example-letter.txt"),
  ];
  for (const path of candidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // try the next location
    }
  }
  return "";
}

export function buildCoverLetterPrompt(args: {
  job: Pick<Job, "title" | "employer" | "location" | "jobDescription">;
  profileJson: string;
  example: string;
  tone: string;
  formality: string;
  constraints: string;
  doNotUse: string;
  instructions?: string | null;
}): string {
  const description = stripHtmlTags(args.job.jobDescription ?? "").slice(
    0,
    MAX_DESCRIPTION_CHARS,
  );
  return [
    "Write a cover letter for this job, in the candidate's own voice.",
    "",
    "Match the structure, length and voice of the example letter below: a warm, specific greeting; a short opening on why this company and role stand out; a one-line lead-in; 3 bullets, each starting with a **bold theme:** followed by concrete evidence from the candidate's real experience; a short, confident closing that asks for a call. About 200-280 words.",
    "The example is for a different company. Reuse its style, never its company-specific content. Only use facts that appear in the candidate profile; never invent employers, numbers or achievements. Choose the bullet themes from what this job description asks for.",
    "If the hiring manager's name is not known, use a friendly greeting such as 'Hi [Company] team,'.",
    "Plain text only: no date, no address block, no sign-off and no name at the end (they are added automatically).",
    `Tone: ${args.tone || "warm and direct"}. Formality: ${args.formality || "medium"}.`,
    args.constraints ? `Writing constraints: ${args.constraints}` : "",
    args.doNotUse ? `Never use these words or phrases: ${args.doNotUse}` : "",
    args.instructions?.trim()
      ? `Extra instructions from the candidate (follow these): ${args.instructions.trim()}`
      : "",
    "",
    "<example_letter>",
    args.example.trim(),
    "</example_letter>",
    "",
    "<job>",
    `Title: ${args.job.title}`,
    `Company: ${args.job.employer}`,
    args.job.location ? `Location: ${args.job.location}` : "",
    "Description:",
    description,
    "</job>",
    "",
    "<candidate_profile>",
    args.profileJson,
    "</candidate_profile>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** One AI call: drafts a letter for the job. The caller decides whether to save it. */
export async function generateCoverLetter(
  job: Pick<Job, "id" | "title" | "employer" | "location" | "jobDescription">,
  instructions?: string | null,
): Promise<string> {
  const [model, style, profile, example] = await Promise.all([
    resolveLlmModel("tailoring"),
    getWritingStyle(),
    getProfile().then(filterProfileProjectsForAi),
    loadExampleLetter(),
  ]);

  const profileJson = JSON.stringify({
    name: profile.basics?.name,
    headline: profile.basics?.label,
    summary: profile.basics?.summary,
    experience: profile.sections?.experience?.items?.map((item) => ({
      company: item.company,
      position: item.position,
      date: item.date,
      summary: item.summary,
    })),
    projects: profile.sections?.projects?.items?.map((item) => ({
      name: item.name,
      description: item.description,
      summary: item.summary,
    })),
    skills: profile.sections?.skills?.items?.map((item) => ({
      name: item.name,
      keywords: item.keywords,
    })),
  });

  const prompt = buildCoverLetterPrompt({
    job,
    profileJson,
    example,
    tone: style.tone,
    formality: style.formality,
    constraints: style.constraints,
    doNotUse: style.doNotUse,
    instructions,
  });

  const llm = await createConfiguredLlmService("tailoring");
  const result = await llm.callJson<{ letter?: string }>({
    feature: "cover_letter",
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: SCHEMA,
  });
  if (!result.success) {
    logger.warn("Cover letter generation failed", {
      jobId: job.id,
      error: result.error.slice(0, 300),
    });
    throw new Error(`Could not draft the cover letter: ${result.error}`);
  }
  const letter = (result.data.letter ?? "").trim();
  if (!letter) throw new Error("The AI returned an empty cover letter.");
  return letter;
}

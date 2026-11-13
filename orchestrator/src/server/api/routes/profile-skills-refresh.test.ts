import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

vi.mock("@server/services/modelSelection", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    createConfiguredLlmService: vi.fn(),
    resolveLlmModel: vi.fn().mockResolvedValue("test-model"),
  };
});

import type { LlmService } from "@server/services/llm/service";
import { createConfiguredLlmService } from "@server/services/modelSelection";

const DESCRIPTION = `Own the roadmap, run SQL analysis and manage vendors. ${"More detail about the role and the team. ".repeat(10)}`;

const userSkills = {
  items: [
    {
      id: "mine",
      label: "Storytelling",
      keywords: ["narrative"],
      hidden: false,
      source: "user",
    },
    {
      id: "roadmap",
      label: "Roadmap & prioritization",
      keywords: ["roadmap"],
      hidden: false,
      source: "starter",
    },
    {
      id: "pricing",
      label: "Pricing",
      keywords: ["pricing"],
      hidden: true,
      source: "starter",
    },
  ],
  refreshedAt: null,
};

const aiReply = {
  skills: [
    { label: "Roadmap & Prioritization", keywords: ["roadmap", "backlog"] },
    { label: "Vendor management", keywords: ["vendor"] },
    { label: "Pricing", keywords: ["pricing"] },
  ],
};

function fakeLlm(callJson: ReturnType<typeof vi.fn>) {
  return {
    callJson,
    getProvider: () => "fake",
    getBaseUrl: () => "",
  } as unknown as LlmService;
}

describe.sequential("POST /api/profile/skills/refresh", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.mocked(createConfiguredLlmService).mockReset();
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    const { db, schema } = await import("@server/db");
    await db
      .insert(schema.users)
      .values({ id: "test-user", username: "test-user" });
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    for (let i = 0; i < 3; i++) {
      const job = await createJob({
        source: "linkedin",
        title: "Product Manager",
        employer: `Employer ${i}`,
        jobUrl: `https://example.com/refresh-${i}`,
        jobDescription: DESCRIPTION,
      });
      await updateJob(job.id, { suitabilityScore: 70 });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stopServer({ server, closeDb, tempDir });
  });

  async function putSkills() {
    const res = await fetch(`${baseUrl}/api/profile/entries/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userSkills),
    });
    expect(res.status).toBe(200);
  }

  async function storedSkills() {
    const res = await fetch(`${baseUrl}/api/profile/entries`);
    return (await res.json()).data.skills;
  }

  it("merges AI skills into the stored list and sends trimmed best-fit jobs", async () => {
    await putSkills();
    const callJson = vi
      .fn()
      .mockResolvedValue({ success: true, data: aiReply });
    vi.mocked(createConfiguredLlmService).mockResolvedValue(fakeLlm(callJson));

    const res = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ added: 1, updated: 1, jobsUsed: 3 });
    expect(typeof data.skills.refreshedAt).toBe("string");
    expect(
      data.skills.items.map((i: { id: string; source: string }) => [
        i.id,
        i.source,
      ]),
    ).toEqual([
      ["mine", "user"],
      ["roadmap", "starter"],
      ["pricing", "starter"],
      ["ai-vendor-management", "ai"],
    ]);
    expect(data.skills.items[1].keywords).toEqual(["roadmap", "backlog"]);
    expect(data.skills.items[2].keywords).toEqual(["pricing"]);

    expect(createConfiguredLlmService).toHaveBeenCalledWith("scoring");
    const [request] = callJson.mock.calls[0];
    expect(request.feature).toBe("profile_skills");
    expect(request.model).toBe("test-model");
    expect(request.jsonSchema.name).toBe("profile_skills");
    expect(request.messages[0].content).toContain("Own the roadmap");
    expect(request.messages[0].content).toContain("Storytelling");

    expect(await storedSkills()).toEqual(data.skills);
  });

  it("returns 502 and leaves stored skills unchanged when the LLM fails", async () => {
    await putSkills();
    const before = await storedSkills();
    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      fakeLlm(vi.fn().mockResolvedValue({ success: false, error: "boom" })),
    );

    const res = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(res.status).toBe(502);
    expect(await storedSkills()).toEqual(before);
  });

  it("returns 502 when the reply has no usable skills", async () => {
    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      fakeLlm(
        vi.fn().mockResolvedValue({ success: true, data: { skills: [] } }),
      ),
    );
    const res = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(res.status).toBe(502);
    expect(await storedSkills()).toBeNull();
  });

  it("returns 409 while a refresh is already running, then frees the lock", async () => {
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const callJson = vi
      .fn()
      .mockImplementationOnce(async () => {
        await pending;
        return { success: true, data: aiReply };
      })
      .mockResolvedValue({ success: true, data: aiReply });
    vi.mocked(createConfiguredLlmService).mockResolvedValue(fakeLlm(callJson));

    const first = fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    await vi.waitFor(() => expect(callJson).toHaveBeenCalledTimes(1));

    const second = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(second.status).toBe(409);

    release(null);
    expect((await first).status).toBe(200);

    const third = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(third.status).toBe(200);
  });

  it("records token usage under profile_skills so it shows in Spend", async () => {
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("openrouter.ai")) return nativeFetch(input, init);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiReply) } }],
          usage: { prompt_tokens: 1200, completion_tokens: 300 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    // Imported after startServer so it writes to this test's database.
    const { LlmService: RealLlmService } = await import(
      "@server/services/llm/service"
    );
    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      new RealLlmService({ provider: "openrouter", apiKey: "sk-or-test" }),
    );

    const res = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const { db, schema } = await import("@server/db");
    const rows = await db.select().from(schema.llmUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "profile_skills",
      model: "test-model",
      inputTokens: 1200,
      outputTokens: 300,
      userId: "test-user",
      success: true,
    });
  });

  it("returns 400 without calling the LLM when no job is scored", async () => {
    const { db, schema } = await import("@server/db");
    await db.delete(schema.jobs);
    const callJson = vi.fn();
    vi.mocked(createConfiguredLlmService).mockResolvedValue(fakeLlm(callJson));
    const res = await fetch(`${baseUrl}/api/profile/skills/refresh`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(callJson).not.toHaveBeenCalled();
  });
});

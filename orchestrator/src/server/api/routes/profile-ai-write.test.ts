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

const replies = {
  pitch: { s15: "Short.", s30: "Medium.", s60: "Long." },
  story: {
    title: "Churn fix",
    themes: ["delivery", "analytics"],
    situation: "Churn was rising",
    task: "Find why",
    action: "Ran interviews",
    result: "Churn down [X%]",
    metric: "",
    followUps: ["By how much did churn drop?"],
  },
  values: {
    items: [
      { label: "Autonomy", starred: true },
      { label: "Clear goals", starred: false },
    ],
    ideal: { size: 30, management: 60, office: 20 },
  },
  brand: { line: "PM who ships B2B workflow products teams adopt." },
} as const;

const expected = {
  pitch: replies.pitch,
  story: { ...replies.story, metric: null },
  values: replies.values,
  brand: replies.brand,
};

function fakeLlm(callJson: ReturnType<typeof vi.fn>) {
  return {
    callJson,
    getProvider: () => "fake",
    getBaseUrl: () => "",
  } as unknown as LlmService;
}

function post(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/api/profile/ai/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.sequential("POST /api/profile/ai/write", () => {
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stopServer({ server, closeDb, tempDir });
  });

  for (const target of ["pitch", "story", "values", "brand"] as const) {
    it(`returns a ${target} draft with the right shape and saves nothing`, async () => {
      const callJson = vi
        .fn()
        .mockResolvedValue({ success: true, data: replies[target] });
      vi.mocked(createConfiguredLlmService).mockResolvedValue(
        fakeLlm(callJson),
      );

      const res = await post(baseUrl, {
        target,
        notes: `My thoughts about the ${target}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual(expected[target]);

      expect(createConfiguredLlmService).toHaveBeenCalledWith("tailoring");
      const [request] = callJson.mock.calls[0];
      expect(request.feature).toBe("profile_writing");
      expect(request.model).toBe("test-model");
      expect(request.jsonSchema.name).toBe(`profile_${target}`);
      const prompt = request.messages[0].content as string;
      expect(prompt).toContain(`My thoughts about the ${target}`);
      expect(prompt).toContain("Never invent employers");
      expect(prompt).toContain("[placeholder]");

      const entries = await fetch(`${baseUrl}/api/profile/entries`).then((r) =>
        r.json(),
      );
      expect(entries.data).toMatchObject({
        brand: null,
        pitch: null,
        values: null,
        stories: [],
      });
    });
  }

  it("sends the current draft and saved stories as context", async () => {
    await fetch(`${baseUrl}/api/profile/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Pricing relaunch",
        themes: ["delivery"],
        situation: "",
        task: "",
        action: "",
        result: "ARPU up 12%",
        metric: "+12% ARPU",
        source: "manual",
      }),
    });
    const callJson = vi
      .fn()
      .mockResolvedValue({ success: true, data: replies.pitch });
    vi.mocked(createConfiguredLlmService).mockResolvedValue(fakeLlm(callJson));

    const res = await post(baseUrl, {
      target: "pitch",
      current: { s15: "I turn churn data into fixes." },
    });
    expect(res.status).toBe(200);
    const prompt = callJson.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("I turn churn data into fixes.");
    expect(prompt).toContain("Pricing relaunch: ARPU up 12%");
  });

  it("returns 400 on a bad body without calling the LLM", async () => {
    const callJson = vi.fn();
    vi.mocked(createConfiguredLlmService).mockResolvedValue(fakeLlm(callJson));
    for (const body of [
      {},
      { target: "resume" },
      { target: "pitch", notes: "x".repeat(4001) },
      { target: "story", current: { themes: ["nonsense"] } },
    ]) {
      const res = await post(baseUrl, body);
      expect(res.status).toBe(400);
    }
    expect(callJson).not.toHaveBeenCalled();
  });

  it("returns 502 when the LLM fails or returns an empty draft", async () => {
    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      fakeLlm(vi.fn().mockResolvedValue({ success: false, error: "boom" })),
    );
    expect((await post(baseUrl, { target: "brand" })).status).toBe(502);

    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      fakeLlm(vi.fn().mockResolvedValue({ success: true, data: { line: "" } })),
    );
    expect((await post(baseUrl, { target: "brand" })).status).toBe(502);
  });

  it("records token usage under profile_writing so it shows in Spend", async () => {
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("openrouter.ai")) return nativeFetch(input, init);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(replies.brand) } }],
          usage: { prompt_tokens: 900, completion_tokens: 40 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const { LlmService: RealLlmService } = await import(
      "@server/services/llm/service"
    );
    vi.mocked(createConfiguredLlmService).mockResolvedValue(
      new RealLlmService({ provider: "openrouter", apiKey: "sk-or-test" }),
    );

    const res = await post(baseUrl, { target: "brand", notes: "B2B" });
    expect(res.status).toBe(200);

    const { db, schema } = await import("@server/db");
    const rows = await db.select().from(schema.llmUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "profile_writing",
      model: "test-model",
      inputTokens: 900,
      outputTokens: 40,
      userId: "test-user",
      success: true,
    });
  });
});

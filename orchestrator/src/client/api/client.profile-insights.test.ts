import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

function ok(data: unknown, status = 200): Response {
  const payload = { ok: true, data, meta: { requestId: "req-1" } };
  return {
    ok: true,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

const story = {
  title: "Cut call volume",
  themes: ["delivery" as const],
  situation: "",
  task: "",
  action: "",
  result: "Removed 100K calls a year",
  metric: "100K",
  source: "manual" as const,
};

describe("profile insights API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  it("unwraps insights and entries", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(ok({ dataState: "ok" }))
      .mockResolvedValueOnce(ok({ stories: [] }));

    await expect(api.getProfileInsights()).resolves.toEqual({
      dataState: "ok",
    });
    await expect(api.getProfileEntries()).resolves.toEqual({ stories: [] });
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/profile/insights");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/profile/entries");
  });

  it("puts a singleton entry as the raw data body", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(ok({ id: "e1" }));
    const data = { line: "Ops lead", industries: [] };
    await api.saveProfileEntry("brand", data);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/profile/entries/brand",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(data) }),
    );
  });

  it("creates, updates and deletes stories", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(ok({ id: "s1" }, 201))
      .mockResolvedValueOnce(ok({ id: "s1" }))
      .mockResolvedValueOnce(ok({ deleted: true }));

    await api.createStory(story);
    await api.updateStory("s1", story);
    await expect(api.deleteStory("s1")).resolves.toEqual({ deleted: true });

    expect(
      fetchSpy.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      ["/api/profile/stories", "POST"],
      ["/api/profile/stories/s1", "PUT"],
      ["/api/profile/stories/s1", "DELETE"],
    ]);
  });

  it("posts an AI writing request and returns the draft", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(ok({ line: "Draft line" }));
    await expect(
      api.writeProfileDraft({ target: "brand", notes: "B2B" }),
    ).resolves.toEqual({ line: "Draft line" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/profile/ai/write");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      target: "brand",
      notes: "B2B",
    });
  });

  it("posts a skills refresh", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(ok({ added: 2, updated: 1, jobsUsed: 30 }));
    await expect(api.refreshSkills()).resolves.toMatchObject({ added: 2 });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/profile/skills/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

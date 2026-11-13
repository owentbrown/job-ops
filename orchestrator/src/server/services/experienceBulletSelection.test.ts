import type { ExperienceBulletCatalogItem } from "@shared/resume-experience-bullets";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { callJsonMock } = vi.hoisted(() => ({ callJsonMock: vi.fn() }));

vi.mock("./modelSelection", () => ({
  resolveLlmModel: vi.fn().mockResolvedValue("test-model"),
  createConfiguredLlmService: vi
    .fn()
    .mockResolvedValue({ callJson: callJsonMock }),
}));

import {
  buildExperienceBulletSelectionPrompt,
  getExperienceBulletTier,
  normalizeExperienceBulletPicks,
  pickExperienceBulletsForJob,
} from "./experienceBulletSelection";

const item = (
  id: string,
  bulletCount: number,
): ExperienceBulletCatalogItem => ({
  id,
  company: `${id} Co`,
  position: "Engineer",
  period: "2020",
  bullets: Array.from({ length: bulletCount }, (_, i) => `${id} bullet ${i}`),
});

const catalog = [
  item("r1", 6),
  item("r2", 5),
  item("r3", 5),
  item("r4", 4),
  item("r5", 4),
];

describe("experience bullet tiers", () => {
  it("treats the first two roles as recent and roughly the last 40% as oldest", () => {
    expect([0, 1, 2, 3, 4].map((p) => getExperienceBulletTier(p, 5))).toEqual([
      "recent",
      "recent",
      "mid",
      "oldest",
      "oldest",
    ]);
    expect([0, 1, 2].map((p) => getExperienceBulletTier(p, 3))).toEqual([
      "recent",
      "recent",
      "oldest",
    ]);
  });
});

describe("normalizeExperienceBulletPicks", () => {
  it("drops invalid indices and unknown ids, and caps each role at its tier", () => {
    const selection = normalizeExperienceBulletPicks(
      [
        { id: "r1", keep: [5, 0, 0, 2, 3, 1, 99, -1] },
        { id: "r2", keep: [4, 1] },
        { id: "r3", keep: [3, 2, 1] },
        { id: "r4", keep: [2, 0] },
        { id: "r5", keep: [] },
        { id: "unknown", keep: [0] },
      ],
      catalog,
    );
    expect(selection).toEqual({
      r1: [0, 2, 3, 5],
      r2: [1, 4],
      r3: [2, 3],
      r4: [2],
      r5: [],
    });
  });

  it("gives roles the model skipped their first bullets up to the tier maximum", () => {
    expect(
      normalizeExperienceBulletPicks([{ id: "r1", keep: [1] }], catalog),
    ).toEqual({
      r1: [1],
      r2: [0, 1, 2, 3],
      r3: [0, 1],
      r4: [0],
      r5: [0],
    });
  });
});

describe("pickExperienceBulletsForJob", () => {
  beforeEach(() => {
    callJsonMock.mockReset();
  });

  it("sends only the job description and minimal role fields", () => {
    const prompt = buildExperienceBulletSelectionPrompt({
      jobDescription: "Build APIs",
      catalog,
    });
    const rolesJson = prompt.match(/Roles:\n(?<roles>.+)\n/)?.groups?.roles;
    const roles = JSON.parse(rolesJson ?? "[]");
    expect(Object.keys(roles[0]).sort()).toEqual([
      "bullets",
      "company",
      "id",
      "keep",
      "period",
      "position",
    ]);
    expect(roles.map((role: { keep: string }) => role.keep)).toEqual([
      "3-4",
      "3-4",
      "2",
      "0-1",
      "0-1",
    ]);
  });

  it("returns the validated selection on success", async () => {
    callJsonMock.mockResolvedValue({
      success: true,
      data: { experience: [{ id: "r1", keep: [0, 1, 2] }] },
    });
    const selection = await pickExperienceBulletsForJob({
      jobDescription: "<p>Build APIs</p>",
      catalog,
      jobId: "job-1",
    });
    expect(selection?.r1).toEqual([0, 1, 2]);
    expect(callJsonMock.mock.calls[0][0].messages[0].content).toContain(
      "Build APIs",
    );
    expect(callJsonMock.mock.calls[0][0].jobId).toBe("job-1");
  });

  it("returns null (keep all bullets) when the model call fails", async () => {
    callJsonMock.mockResolvedValue({ success: false, error: "boom" });
    await expect(
      pickExperienceBulletsForJob({ jobDescription: "x", catalog }),
    ).resolves.toBeNull();
  });

  it("does not call the model when no role has bullets", async () => {
    await expect(
      pickExperienceBulletsForJob({
        jobDescription: "x",
        catalog: [item("r1", 0)],
      }),
    ).resolves.toBeNull();
    expect(callJsonMock).not.toHaveBeenCalled();
  });
});

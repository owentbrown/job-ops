import * as api from "@client/api";
import type { StoryEntry } from "@shared/types";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/client/lib/queryKeys";
import { renderHookWithQueryClient } from "../test/renderWithQueryClient";
import {
  useProfileEntries,
  useProfileInsights,
  useProfileMutations,
} from "./useProfileInsights";

vi.mock("@client/api", () => ({
  getProfileInsights: vi.fn(),
  getProfileEntries: vi.fn(),
  saveProfileEntry: vi.fn(),
  createStory: vi.fn(),
  updateStory: vi.fn(),
  deleteStory: vi.fn(),
  refreshSkills: vi.fn(),
}));

const story: StoryEntry = {
  title: "Cut call volume",
  themes: ["delivery"],
  situation: "s",
  task: "t",
  action: "a",
  result: "r",
  metric: "100K calls",
  source: "manual",
};

describe("profile insights queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads insights and entries under the profile keys", async () => {
    vi.mocked(api.getProfileInsights).mockResolvedValue({
      dataState: "ok",
    } as never);
    vi.mocked(api.getProfileEntries).mockResolvedValue({
      stories: [],
    } as never);

    const { result, queryClient } = renderHookWithQueryClient(() => ({
      insights: useProfileInsights(),
      entries: useProfileEntries(),
    }));

    await waitFor(() => expect(result.current.insights.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.profile.insights())).toEqual({
      dataState: "ok",
    });
    expect(queryClient.getQueryData(queryKeys.profile.entries())).toEqual({
      stories: [],
    });
  });

  it("keeps the resume profile key separate", () => {
    expect(queryKeys.profile.insights()).toEqual(["profile", "insights"]);
    expect(queryKeys.profile.entries()).toEqual(["profile", "entries"]);
    expect(queryKeys.profile.current()).toEqual(["profile", "current"]);
  });
});

describe("useProfileMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  const cases: Array<{
    name: string;
    run: (m: ReturnType<typeof useProfileMutations>) => Promise<unknown>;
    expectCall: () => void;
  }> = [
    {
      name: "saveEntry",
      run: (m) =>
        m.saveEntry.mutateAsync({
          kind: "brand",
          data: { line: "Ops lead", industries: ["Insurance"] },
        }),
      expectCall: () =>
        expect(api.saveProfileEntry).toHaveBeenCalledWith("brand", {
          line: "Ops lead",
          industries: ["Insurance"],
        }),
    },
    {
      name: "createStory",
      run: (m) => m.createStory.mutateAsync(story),
      expectCall: () => expect(api.createStory).toHaveBeenCalledWith(story),
    },
    {
      name: "updateStory",
      run: (m) => m.updateStory.mutateAsync({ id: "s1", data: story }),
      expectCall: () =>
        expect(api.updateStory).toHaveBeenCalledWith("s1", story),
    },
    {
      name: "deleteStory",
      run: (m) => m.deleteStory.mutateAsync("s1"),
      expectCall: () => expect(api.deleteStory).toHaveBeenCalledWith("s1"),
    },
    {
      name: "refreshSkills",
      run: (m) => m.refreshSkills.mutateAsync(),
      expectCall: () => expect(api.refreshSkills).toHaveBeenCalledTimes(1),
    },
  ];

  it.each(cases)("$name calls its endpoint and invalidates both keys", async ({
    run,
    expectCall,
  }) => {
    for (const fn of [
      api.saveProfileEntry,
      api.createStory,
      api.updateStory,
      api.deleteStory,
      api.refreshSkills,
    ]) {
      vi.mocked(fn).mockResolvedValue({} as never);
    }
    const { result, queryClient } = renderHookWithQueryClient(() =>
      useProfileMutations(),
    );
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await run(result.current);
    });

    expectCall();
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(queryKeys.profile.insights());
    expect(keys).toContainEqual(queryKeys.profile.entries());
  });
});

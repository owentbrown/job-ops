import type {
  BrandEntry,
  PitchEntry,
  ProfileAiDraftByTarget,
  ProfileAiWriteRequest,
  ProfileEntriesResponse,
  ProfileEntryRow,
  ProfileInsightsResponse,
  ProfileSingletonKind,
  ProfileSkillsRefreshResponse,
  SkillsEntry,
  StoryEntry,
  ValuesEntry,
} from "@shared/types";
import { fetchApi } from "./core";

/** Body shape for each singleton kind saved through PUT /entries/:kind. */
export interface ProfileSingletonData {
  brand: BrandEntry;
  pitch: PitchEntry;
  values: ValuesEntry;
  skills: SkillsEntry;
}

export async function getProfileInsights(): Promise<ProfileInsightsResponse> {
  return fetchApi<ProfileInsightsResponse>("/profile/insights");
}

export async function getProfileEntries(): Promise<ProfileEntriesResponse> {
  return fetchApi<ProfileEntriesResponse>("/profile/entries");
}

export async function saveProfileEntry<K extends ProfileSingletonKind>(
  kind: K,
  data: ProfileSingletonData[K],
): Promise<ProfileEntryRow<ProfileSingletonData[K]>> {
  return fetchApi<ProfileEntryRow<ProfileSingletonData[K]>>(
    `/profile/entries/${encodeURIComponent(kind)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
}

export async function createStory(
  data: StoryEntry,
): Promise<ProfileEntryRow<StoryEntry>> {
  return fetchApi<ProfileEntryRow<StoryEntry>>("/profile/stories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateStory(
  id: string,
  data: StoryEntry,
): Promise<ProfileEntryRow<StoryEntry>> {
  return fetchApi<ProfileEntryRow<StoryEntry>>(
    `/profile/stories/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
}

export async function deleteStory(id: string): Promise<{ deleted: true }> {
  return fetchApi<{ deleted: true }>(
    `/profile/stories/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** AI skill refresh. 409 while one is running, 502 on model failure. */
export async function refreshSkills(): Promise<ProfileSkillsRefreshResponse> {
  return fetchApi<ProfileSkillsRefreshResponse>("/profile/skills/refresh", {
    method: "POST",
  });
}

/**
 * AI draft for one About you panel. Nothing is saved; the panel fills its
 * fields with the draft. 400 on a bad body, 502 when the model fails.
 */
export async function writeProfileDraft<R extends ProfileAiWriteRequest>(
  request: R,
): Promise<ProfileAiDraftByTarget[R["target"]]> {
  return fetchApi<ProfileAiDraftByTarget[R["target"]]>("/profile/ai/write", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

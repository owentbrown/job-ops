import * as api from "@client/api";
import type { ProfileSingletonData } from "@client/api/profile-insights";
import type {
  ProfileEntriesResponse,
  ProfileInsightsResponse,
  ProfileSingletonKind,
  StoryEntry,
} from "@shared/types";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/client/lib/queryKeys";

/** Insights for Profile › About you (strength, skill map, roles, landing). */
export function useProfileInsights() {
  return useQuery<ProfileInsightsResponse>({
    queryKey: queryKeys.profile.insights(),
    queryFn: api.getProfileInsights,
  });
}

/** Saved profile entries: brand, pitch, values, skills and stories. */
export function useProfileEntries() {
  return useQuery<ProfileEntriesResponse>({
    queryKey: queryKeys.profile.entries(),
    queryFn: api.getProfileEntries,
  });
}

/** Any profile write changes the insights too, so refresh both. */
export async function invalidateProfileData(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.insights() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.entries() }),
  ]);
}

export type SaveProfileEntryInput = {
  [K in ProfileSingletonKind]: { kind: K; data: ProfileSingletonData[K] };
}[ProfileSingletonKind];

export function useProfileMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => invalidateProfileData(queryClient);

  const saveEntry = useMutation({
    mutationFn: (input: SaveProfileEntryInput) =>
      // The union is checked at the call site; the API helper is generic.
      api.saveProfileEntry(
        input.kind,
        input.data as ProfileSingletonData[typeof input.kind],
      ),
    onSuccess,
  });

  const createStory = useMutation({
    mutationFn: (data: StoryEntry) => api.createStory(data),
    onSuccess,
  });

  const updateStory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StoryEntry }) =>
      api.updateStory(id, data),
    onSuccess,
  });

  const deleteStory = useMutation({
    mutationFn: (id: string) => api.deleteStory(id),
    onSuccess,
  });

  const refreshSkills = useMutation({
    mutationFn: () => api.refreshSkills(),
    onSuccess,
  });

  return { saveEntry, createStory, updateStory, deleteStory, refreshSkills };
}

import * as api from "@client/api";
import {
  type ExperienceBulletSelection,
  parseExperienceBulletSelection,
  serializeExperienceBulletSelection,
} from "@shared/resume-experience-bullets";
import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTailoredSkillDraftId,
  type EditableSkillGroup,
  fromEditableSkillGroups,
  parseTailoredSkills,
  serializeTailoredSkills,
  toEditableSkillGroups,
} from "../tailoring-utils";

const parseSelectedIds = (value: string | null | undefined) =>
  new Set(value?.split(",").filter(Boolean) ?? []);

const toSelectedIdsCsv = (ids: Set<string>) => Array.from(ids).sort().join(",");

const hasSelectionDiff = (current: Set<string>, saved: Set<string>) => {
  if (current.size !== saved.size) return true;
  for (const id of current) {
    if (!saved.has(id)) return true;
  }
  return false;
};

const parseBulletSelection = (value: string | null | undefined) =>
  parseExperienceBulletSelection(value ?? null);

export interface TailoringSavePayload {
  tailoredSummary: string;
  tailoredHeadline: string;
  tailoredSkills: string;
  jobDescription: string;
  selectedProjectIds: string;
  /** Canonical JSON from serializeExperienceBulletSelection; "" keeps all bullets. */
  selectedExperienceBullets: string;
  tracerLinksEnabled: boolean;
}

export const getTailoringSavePayloadKey = (
  payload: TailoringSavePayload,
): string =>
  JSON.stringify({
    tailoredSummary: payload.tailoredSummary,
    tailoredHeadline: payload.tailoredHeadline,
    tailoredSkills: payload.tailoredSkills,
    jobDescription: payload.jobDescription,
    selectedProjectIds: toSelectedIdsCsv(
      parseSelectedIds(payload.selectedProjectIds),
    ),
    selectedExperienceBullets: serializeExperienceBulletSelection(
      parseBulletSelection(payload.selectedExperienceBullets),
    ),
    tracerLinksEnabled: payload.tracerLinksEnabled,
  });

const parseIncomingDraft = (incomingJob: Job) => {
  const summary = incomingJob.tailoredSummary || "";
  const headline = incomingJob.tailoredHeadline || "";
  const description = incomingJob.jobDescription || "";
  const selectedIds = parseSelectedIds(incomingJob.selectedProjectIds);
  const skillsDraft = toEditableSkillGroups(
    parseTailoredSkills(incomingJob.tailoredSkills),
  );
  const skillsJson = serializeTailoredSkills(
    fromEditableSkillGroups(skillsDraft),
  );
  const tracerLinksEnabled = Boolean(incomingJob.tracerLinksEnabled);
  const bulletSelection = parseBulletSelection(
    incomingJob.selectedExperienceBullets,
  );

  return {
    bulletSelection,
    summary,
    headline,
    description,
    selectedIds,
    skillsDraft,
    skillsJson,
    tracerLinksEnabled,
  };
};

interface UseTailoringDraftParams {
  job: Job;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function useTailoringDraft({
  job,
  onDirtyChange,
}: UseTailoringDraftParams) {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [headline, setHeadline] = useState(job.tailoredHeadline || "");
  const [jobDescription, setJobDescription] = useState(
    job.jobDescription || "",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );
  const [skillsDraft, setSkillsDraft] = useState<EditableSkillGroup[]>(() =>
    toEditableSkillGroups(parseTailoredSkills(job.tailoredSkills)),
  );
  const [bulletSelection, setBulletSelection] =
    useState<ExperienceBulletSelection | null>(() =>
      parseBulletSelection(job.selectedExperienceBullets),
    );
  const [savedBulletSelectionJson, setSavedBulletSelectionJson] = useState(() =>
    serializeExperienceBulletSelection(
      parseBulletSelection(job.selectedExperienceBullets),
    ),
  );
  const [openSkillGroupId, setOpenSkillGroupId] = useState<string>("");
  const [tracerLinksEnabled, setTracerLinksEnabled] = useState(
    Boolean(job.tracerLinksEnabled),
  );

  const [savedSummary, setSavedSummary] = useState(job.tailoredSummary || "");
  const [savedHeadline, setSavedHeadline] = useState(
    job.tailoredHeadline || "",
  );
  const [savedDescription, setSavedDescription] = useState(
    job.jobDescription || "",
  );
  const [savedSelectedIds, setSavedSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );
  const [savedSkillsJson, setSavedSkillsJson] = useState(() =>
    serializeTailoredSkills(parseTailoredSkills(job.tailoredSkills)),
  );
  const [savedTracerLinksEnabled, setSavedTracerLinksEnabled] = useState(
    Boolean(job.tracerLinksEnabled),
  );

  const lastJobIdRef = useRef(job.id);
  const jobRef = useRef(job);

  const skillsJson = useMemo(
    () => serializeTailoredSkills(fromEditableSkillGroups(skillsDraft)),
    [skillsDraft],
  );

  const selectedIdsCsv = useMemo(
    () => toSelectedIdsCsv(selectedIds),
    [selectedIds],
  );

  const bulletSelectionJson = useMemo(
    () => serializeExperienceBulletSelection(bulletSelection),
    [bulletSelection],
  );

  const isDirty = useMemo(() => {
    if (summary !== savedSummary) return true;
    if (headline !== savedHeadline) return true;
    if (jobDescription !== savedDescription) return true;
    if (skillsJson !== savedSkillsJson) return true;
    if (tracerLinksEnabled !== savedTracerLinksEnabled) return true;
    if (bulletSelectionJson !== savedBulletSelectionJson) return true;
    return hasSelectionDiff(selectedIds, savedSelectedIds);
  }, [
    summary,
    savedSummary,
    headline,
    savedHeadline,
    jobDescription,
    savedDescription,
    skillsJson,
    savedSkillsJson,
    tracerLinksEnabled,
    savedTracerLinksEnabled,
    bulletSelectionJson,
    savedBulletSelectionJson,
    selectedIds,
    savedSelectedIds,
  ]);

  const savedPayloadKey = useMemo(
    () =>
      getTailoringSavePayloadKey({
        tailoredSummary: savedSummary,
        tailoredHeadline: savedHeadline,
        tailoredSkills: savedSkillsJson,
        jobDescription: savedDescription,
        selectedProjectIds: toSelectedIdsCsv(savedSelectedIds),
        selectedExperienceBullets: savedBulletSelectionJson,
        tracerLinksEnabled: savedTracerLinksEnabled,
      }),
    [
      savedBulletSelectionJson,
      savedSummary,
      savedHeadline,
      savedSkillsJson,
      savedDescription,
      savedSelectedIds,
      savedTracerLinksEnabled,
    ],
  );

  const applyIncomingDraft = useCallback((incomingJob: Job) => {
    const next = parseIncomingDraft(incomingJob);
    setSummary(next.summary);
    setHeadline(next.headline);
    setJobDescription(next.description);
    setSelectedIds(next.selectedIds);
    setSkillsDraft(next.skillsDraft);
    setSavedSummary(next.summary);
    setSavedHeadline(next.headline);
    setSavedDescription(next.description);
    setSavedSelectedIds(next.selectedIds);
    setSavedSkillsJson(next.skillsJson);
    setTracerLinksEnabled(next.tracerLinksEnabled);
    setSavedTracerLinksEnabled(next.tracerLinksEnabled);
    setBulletSelection(next.bulletSelection);
    setSavedBulletSelectionJson(
      serializeExperienceBulletSelection(next.bulletSelection),
    );
  }, []);

  const markSavedSnapshot = useCallback((snapshot: TailoringSavePayload) => {
    setSavedSummary(snapshot.tailoredSummary);
    setSavedHeadline(snapshot.tailoredHeadline);
    setSavedDescription(snapshot.jobDescription);
    setSavedSelectedIds(parseSelectedIds(snapshot.selectedProjectIds));
    setSavedSkillsJson(snapshot.tailoredSkills);
    setSavedTracerLinksEnabled(snapshot.tracerLinksEnabled);
    setSavedBulletSelectionJson(
      serializeExperienceBulletSelection(
        parseBulletSelection(snapshot.selectedExperienceBullets),
      ),
    );
  }, []);

  const markSavedJob = useCallback((incomingJob: Job) => {
    const next = parseIncomingDraft(incomingJob);
    setSavedSummary(next.summary);
    setSavedHeadline(next.headline);
    setSavedDescription(next.description);
    setSavedSelectedIds(next.selectedIds);
    setSavedSkillsJson(next.skillsJson);
    setSavedTracerLinksEnabled(next.tracerLinksEnabled);
    setSavedBulletSelectionJson(
      serializeExperienceBulletSelection(next.bulletSelection),
    );
  }, []);

  const loadCatalog = useCallback(async (silently = false) => {
    if (!silently) setIsCatalogLoading(true);
    try {
      const nextCatalog = await api.getResumeProjectsCatalog();
      setCatalog(nextCatalog);
    } catch {
      if (!silently) setCatalog([]);
    } finally {
      if (!silently) setIsCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    void loadCatalog(false);

    const refreshCatalog = () => {
      void loadCatalog(true);
    };

    window.addEventListener("focus", refreshCatalog);
    document.addEventListener("visibilitychange", refreshCatalog);
    return () => {
      window.removeEventListener("focus", refreshCatalog);
      document.removeEventListener("visibilitychange", refreshCatalog);
    };
  }, [loadCatalog]);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // Only sync when job ID changes (user switched to a different job)
  // User edits persist until explicitly saved - no auto-sync from server
  useEffect(() => {
    if (job.id !== lastJobIdRef.current) {
      lastJobIdRef.current = job.id;
      applyIncomingDraft(jobRef.current);
    }
  }, [job.id, applyIncomingDraft]);

  useEffect(() => {
    if (
      openSkillGroupId.length > 0 &&
      !skillsDraft.some((group) => group.id === openSkillGroupId)
    ) {
      setOpenSkillGroupId("");
    }
  }, [skillsDraft, openSkillGroupId]);

  const handleToggleProject = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const replaceSelectedProjects = useCallback((ids: Iterable<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  /**
   * Toggles one bullet of an experience item. An item without a stored
   * selection keeps every bullet, so the first toggle starts from all of them.
   */
  const handleToggleExperienceBullet = useCallback(
    (itemId: string, index: number, bulletCount: number) => {
      setBulletSelection((prev) => {
        const current =
          prev?.[itemId] ??
          Array.from({ length: bulletCount }, (_, bullet) => bullet);
        const next = current.includes(index)
          ? current.filter((bullet) => bullet !== index)
          : [...current, index].sort((a, b) => a - b);
        return { ...(prev ?? {}), [itemId]: next };
      });
    },
    [],
  );

  /** Keeps every bullet for one item, or for all items when no id is given. */
  const handleKeepAllExperienceBullets = useCallback((itemId?: string) => {
    setBulletSelection((prev) => {
      if (!prev || itemId === undefined) return null;
      const { [itemId]: _removed, ...rest } = prev;
      return Object.keys(rest).length > 0 ? rest : null;
    });
  }, []);

  const handleAddSkillGroup = useCallback(() => {
    const nextId = createTailoredSkillDraftId();
    setSkillsDraft((prev) => [
      ...prev,
      { id: nextId, name: "", keywordsText: "" },
    ]);
    setOpenSkillGroupId(nextId);
  }, []);

  const handleUpdateSkillGroup = useCallback(
    (id: string, key: "name" | "keywordsText", value: string) => {
      setSkillsDraft((prev) =>
        prev.map((group) =>
          group.id === id ? { ...group, [key]: value } : group,
        ),
      );
    },
    [],
  );

  const handleRemoveSkillGroup = useCallback((id: string) => {
    setSkillsDraft((prev) => prev.filter((group) => group.id !== id));
  }, []);

  return {
    catalog,
    isCatalogLoading,
    summary,
    setSummary,
    headline,
    setHeadline,
    jobDescription,
    setJobDescription,
    selectedIds,
    selectedIdsCsv,
    bulletSelection,
    bulletSelectionJson,
    skillsDraft,
    setSkillsDraft,
    openSkillGroupId,
    setOpenSkillGroupId,
    skillsJson,
    tracerLinksEnabled,
    setTracerLinksEnabled,
    isDirty,
    savedPayloadKey,
    applyIncomingDraft,
    markSavedSnapshot,
    markSavedJob,
    handleToggleProject,
    replaceSelectedProjects,
    handleToggleExperienceBullet,
    handleKeepAllExperienceBullets,
    handleAddSkillGroup,
    handleUpdateSkillGroup,
    handleRemoveSkillGroup,
  };
}

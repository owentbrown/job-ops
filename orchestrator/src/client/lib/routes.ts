export const PROFILE_BASE = "/profile";
export const RESUME_STUDIO_BASE = "/profile/studio/resume";
export const COVER_LETTER_STUDIO = "/profile/studio/cover-letter";
export const resumeSectionPath = (sectionId?: string | null) =>
  sectionId ? `${RESUME_STUDIO_BASE}/${sectionId}` : RESUME_STUDIO_BASE;

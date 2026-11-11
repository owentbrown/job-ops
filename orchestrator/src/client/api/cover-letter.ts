import { fetchApi, fetchBlobApi } from "./core";

export function saveCoverLetter(
  jobId: string,
  text: string | null,
): Promise<{ id: string; coverLetter: string | null }> {
  return fetchApi(`/jobs/${encodeURIComponent(jobId)}/cover-letter`, {
    method: "PUT",
    body: JSON.stringify({ text }),
  });
}

/** One AI call. The draft is returned, not saved. */
export function generateCoverLetterDraft(
  jobId: string,
  instructions?: string,
): Promise<{ text: string }> {
  return fetchApi(`/jobs/${encodeURIComponent(jobId)}/cover-letter/generate`, {
    method: "POST",
    body: JSON.stringify({ instructions: instructions || null }),
  });
}

export function getCoverLetterPdfBlob(
  jobId: string,
  withResume: boolean,
): Promise<Blob> {
  const file = withResume ? "application.pdf" : "cover-letter.pdf";
  return fetchBlobApi(`/jobs/${encodeURIComponent(jobId)}/${file}`, {
    cache: "no-store",
  });
}

export function getSignatureStatus(): Promise<{ exists: boolean }> {
  return fetchApi("/cover-letter/signature");
}

export function getSignatureBlob(): Promise<Blob> {
  return fetchBlobApi(`/cover-letter/signature.png?v=${Date.now()}`, {
    cache: "no-store",
  });
}

export function uploadSignature(
  dataBase64: string,
): Promise<{ exists: boolean }> {
  return fetchApi("/cover-letter/signature", {
    method: "PUT",
    body: JSON.stringify({ dataBase64 }),
  });
}

export function removeSignature(): Promise<{ exists: boolean }> {
  return fetchApi("/cover-letter/signature", { method: "DELETE" });
}

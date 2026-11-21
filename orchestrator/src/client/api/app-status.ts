import type { JobOpsAppStatusResponse } from "@shared/types";
import { fetchApi } from "./core";

export async function getAppStatus(): Promise<JobOpsAppStatusResponse> {
  return fetchApi<JobOpsAppStatusResponse>("/app/status");
}

/**
 * Sends the crash screen's details to the server log, so a crash on the phone
 * can be diagnosed without a screenshot. Never throws.
 */
export async function reportClientCrash(snapshot: {
  source: string;
  name: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string;
  appVersion: string;
  userAgent: string;
}): Promise<void> {
  try {
    await fetchApi<{ logged: boolean }>("/app/client-crash", {
      method: "POST",
      body: JSON.stringify({
        source: snapshot.source,
        name: snapshot.name,
        message: snapshot.message,
        stack: snapshot.stack,
        componentStack: snapshot.componentStack,
        route: snapshot.route,
        appVersion: snapshot.appVersion,
        userAgent: snapshot.userAgent,
      }),
    });
  } catch {
    // Reporting is best effort; the crash screen still shows the details.
  }
}

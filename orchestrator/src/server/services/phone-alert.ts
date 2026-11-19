import { logger } from "@infra/logger";

/**
 * Sends a push alert to Owen's phone through ntfy (https://ntfy.sh).
 *
 * Set NTFY_TOPIC to a long random topic name and subscribe to it in the ntfy
 * app. NTFY_SERVER overrides the default server. JOBOPS_PUBLIC_URL is the
 * address the phone opens when the alert is tapped. With no topic set this
 * does nothing. It never throws: an alert that fails to send must not break a
 * run.
 */
export async function sendPhoneAlert(input: {
  title: string;
  message: string;
  /** Path inside the app to open on tap, e.g. "/jobs/ready". */
  path?: string;
}): Promise<boolean> {
  const topic = (process.env.NTFY_TOPIC ?? "").trim();
  if (!topic) return false;

  const server = (process.env.NTFY_SERVER ?? "https://ntfy.sh")
    .trim()
    .replace(/\/+$/, "");
  const appUrl = (process.env.JOBOPS_PUBLIC_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  const headers: Record<string, string> = {
    // Header values must be ASCII; keep titles plain.
    Title: input.title.replace(/[^\x20-\x7e]/g, ""),
    Priority: "high",
    Tags: "warning",
  };
  if (appUrl) headers.Click = `${appUrl}${input.path ?? ""}`;

  try {
    const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: input.message,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn("Phone alert was not accepted", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn("Phone alert failed to send", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

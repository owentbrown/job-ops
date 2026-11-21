declare const __APP_VERSION__: string;

/** This fork. Crash reports and version links point here, not upstream. */
export const GITHUB_REPO = "owentbrown/job-ops";
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  lastChecked: number;
}

/**
 * Normalize the app version into the user-facing release format.
 */
export function parseVersion(rawVersion: string): string {
  const normalized = rawVersion.trim();
  if (/^v\d+\.\d+\.\d+$/.test(normalized)) {
    return normalized;
  }
  if (/^\d+\.\d+\.\d+$/.test(normalized)) {
    return `v${normalized}`;
  }
  return normalized || "unknown";
}

export function getCurrentAppVersion(): string {
  const currentRaw =
    typeof __APP_VERSION__ !== "undefined"
      ? (__APP_VERSION__ as string)
      : "unknown";
  return parseVersion(currentRaw);
}

/**
 * Update check. This fork is deployed from its own main branch and publishes
 * no GitHub releases, so comparing against upstream's releases would only nag
 * about versions that aren't in the fork. It reports the running version and
 * never calls GitHub.
 */
export async function checkForUpdate(): Promise<VersionCheckResult> {
  return {
    currentVersion: getCurrentAppVersion(),
    latestVersion: null,
    updateAvailable: false,
    lastChecked: Date.now(),
  };
}

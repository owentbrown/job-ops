import { lookup } from "node:dns/promises";

/**
 * A run that can't look up any of these hosts has no internet, so its
 * "0 jobs" means "never searched", not "nothing new".
 */
const PROBE_HOSTS = [
  "www.google.com",
  "www.linkedin.com",
  "www.cloudflare.com",
];
const PROBE_TIMEOUT_MS = 5000;

export const OFFLINE_RUN_MESSAGE =
  "No internet connection, so no job sites could be searched";

export async function isOnline(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  const anyResolves = Promise.any(
    PROBE_HOSTS.map((host) => lookup(host).then(() => true)),
  ).catch(() => false);
  return Promise.race([anyResolves, timeout]);
}

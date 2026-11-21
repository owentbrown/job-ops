/**
 * Product analytics are removed in this fork.
 *
 * Upstream JobOps sent usage events from the server to the original author's
 * Umami and OpenPanel servers. This fork sends nothing anywhere. The function
 * stays so the many existing call sites need no changes (and upstream merges
 * stay simple); it always reports "not delivered".
 */
export async function trackServerProductEvent(
  _event: string,
  _data?: Record<string, unknown>,
  _options?: {
    distinctId?: string | null;
    occurredAt?: Date | number | string | null;
    requestOrigin?: string | null;
    requestUserAgent?: string | null;
    sessionId?: string | null;
    urlPath?: string;
  },
): Promise<boolean> {
  return false;
}

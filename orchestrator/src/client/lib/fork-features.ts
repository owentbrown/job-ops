/**
 * Features of upstream JobOps that this fork keeps in the code but hides.
 * Flip a flag to bring one back; nothing else needs to change.
 */

/**
 * Tracer links need a public internet URL, which this setup doesn't have.
 * Off: no readiness checks, and no Tracer Links settings or per-job toggle.
 */
export const TRACER_LINKS_ENABLED = false;

/** Settings sections left out of the settings navigation. */
export const HIDDEN_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  "webhooks",
  ...(TRACER_LINKS_ENABLED ? [] : ["tracer-links"]),
]);

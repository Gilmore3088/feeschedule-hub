/**
 * Centralized Modal sidecar endpoint resolution.
 *
 * Code-review MAJOR-1 noted that scattering hardcoded fallback URLs
 * across route handlers is an anti-pattern — if the Modal workspace,
 * app name, or function name changes, every fallback silently routes
 * to 404 and the admin console shows "sidecar unreachable" forever.
 *
 * Rules:
 * - Env vars WIN. Set them in Vercel and the fallback is never used.
 * - Fallbacks are last-resort convenience for local dev. In production
 *   the deploy runbook MUST set the env var; we emit a warning on first
 *   resolution so missing-env regressions are loud in logs.
 * - If the Modal app is renamed, update MODAL_APP_SLUG below and the
 *   warnings will point ops at the one place that needs editing.
 */

// Change these two lines if the Modal workspace or app slug changes.
// Matches `modal deploy fee_crawler/modal_app.py` output on 2026-04-19.
const MODAL_WORKSPACE = "gilmore3088";
const MODAL_APP_SLUG = "bank-fee-index-workers";

function modalUrl(fnName: string): string {
  return `https://${MODAL_WORKSPACE}--${MODAL_APP_SLUG}-${fnName}.modal.run`;
}

const _warned = new Set<string>();

function resolve(envVar: string, fnName: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  if (!_warned.has(envVar)) {
    _warned.add(envVar);
    console.warn(
      `[modal-endpoints] ${envVar} is not set — falling back to ${modalUrl(fnName)}. ` +
        `Set ${envVar} in Vercel env to silence this warning and avoid silent 404s on Modal rename.`,
    );
  }
  return modalUrl(fnName);
}

export const DARWIN_SIDECAR_URL = () =>
  resolve("DARWIN_SIDECAR_URL", "darwin-api");
export const MAGELLAN_SIDECAR_URL = () =>
  resolve("MAGELLAN_SIDECAR_URL", "magellan-api");
export const EXTRACT_SINGLE_URL = () =>
  resolve("EXTRACT_SINGLE_URL", "extract-single");

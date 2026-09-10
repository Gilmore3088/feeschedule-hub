/**
 * Cache-key and tag helpers for per-institution `unstable_cache` reads
 * (profile, fee schedule, evidence). Keeping the key/tag shape in one place
 * means the profile loader and Hamilton's publish-time `revalidateTag` call
 * can never drift apart on the tag string an institution is keyed by.
 */

/**
 * Base cache key for institution `id`, extended with any additional parts
 * to distinguish separate cached reads (profile vs. fees vs. evidence) for
 * the same institution — otherwise those reads would collide on a single
 * `unstable_cache` entry.
 */
export function institutionCacheKey(id: number | string, ...parts: string[]): string[] {
  return ["institution", String(id), ...parts];
}

/** Tag used to invalidate every cached read for institution `id` in one call. */
export function institutionTag(id: number | string): string {
  return `institution:${id}`;
}

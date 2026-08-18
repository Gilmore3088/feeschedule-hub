/**
 * Canonical city URL slug and its inverse. This is the single source of
 * truth for how a city name becomes a path segment (and back) — used by the
 * city fee page, the state city directory, the sitemap, and proxy.ts's
 * canonicalizing redirect, so every surface agrees on one format:
 * lowercase, hyphen-separated, no percent-encoded spaces.
 *
 * Pure and dependency-free so it is safe to import from edge middleware.
 */

/** "Fort Worth" -> "fort-worth" */
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

/** "fort-worth" -> "Fort Worth" (also accepts legacy percent-encoded slugs) */
export function cityName(slug: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return decoded
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Lookup key for matching a city name regardless of hyphen/space convention:
 * "Winston-Salem" and "Winston Salem" both normalize to "winston salem".
 * `cityName()` is lossy for hyphenated names (it always rejoins with spaces,
 * so `cityName(citySlug("Winston-Salem"))` is "Winston Salem", not
 * "Winston-Salem") — DB lookups must use this normalized key on both sides of
 * the comparison rather than relying on `cityName`'s output matching the DB's
 * stored spelling exactly. Mirrored in SQL as
 * `regexp_replace(lower(x), '[-\s]+', ' ', 'g')`.
 */
export function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/[-\s]+/g, " ");
}

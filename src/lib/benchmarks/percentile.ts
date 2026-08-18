/**
 * Pure percentile math shared by every module that computes a fee
 * benchmark, distribution, or histogram window. This file must never
 * import from `@/lib/data-store/*` (or anything else that touches the
 * database/network) — it is imported by client components such as
 * `DistributionChart`, and a DB import here breaks the browser build
 * (Turbopack can't resolve Node built-ins like `net`/`tls`/`fs` client-side).
 */

/** Linear-interpolation percentile over an already-sorted array. */
export function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

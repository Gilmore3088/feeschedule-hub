import { computePercentile } from "@/lib/benchmarks/percentile";

/**
 * Small-n and outlier policy shared by every page that renders a fee
 * benchmark, distribution chart, or ranked list. Keeping these thresholds
 * and helpers in one place means /fees/[category], /research/state,
 * /research/district, and /guides all agree on what "enough data" means
 * and how a single extreme value is kept from distorting a chart or a
 * "cheapest/most expensive" ranking.
 */

/** Below this institution count, a category is too thin to publish a benchmark. */
export const MIN_N_PUBLISH = 5;
/** Below this institution count, a category is still labeled "early data". */
export const MIN_N_EARLY = 10;
/** State/district table rows with fewer institutions than this are suppressed. */
export const MIN_ROW_N = 3;

export type SampleClass = "insufficient" | "early" | "established";

/** Classify a category/row's institution count into a publishing tier. */
export function classifySample(n: number): SampleClass {
  if (n < MIN_N_PUBLISH) return "insufficient";
  if (n < MIN_N_EARLY) return "early";
  return "established";
}

/**
 * Drop values so extreme they would flatten a histogram or skew a percentile:
 * anything greater than max(10 x p75, p99) of the input. A single mis-extracted
 * $5,000 "monthly maintenance" fee is the canonical example this guards against.
 */
export function trimOutliers(values: number[]): { kept: number[]; flagged: number[] } {
  if (values.length === 0) return { kept: [], flagged: [] };

  const sorted = [...values].sort((a, b) => a - b);
  const p75 = computePercentile(sorted, 75);
  const p99 = computePercentile(sorted, 99);
  const threshold = Math.max(10 * p75, p99);

  const kept: number[] = [];
  const flagged: number[] = [];
  for (const value of values) {
    if (value > threshold) {
      flagged.push(value);
    } else {
      kept.push(value);
    }
  }
  return { kept, flagged };
}

/** P5-P95 window for a histogram's x-axis, so a handful of outliers can't flatten it. */
export function histogramWindow(values: number[]): { lo: number; hi: number } {
  if (values.length === 0) return { lo: 0, hi: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    lo: computePercentile(sorted, 5),
    hi: computePercentile(sorted, 95),
  };
}

/**
 * Collapse tiered fee rows to one row per institution, so an institution with
 * several priced tiers for the same fee can't appear twice in a ranked list
 * (once as its cheapest tier, once as its priciest). Defaults to the minimum
 * amount, matching the canonical benchmark's per-institution definition.
 */
export function dedupePerInstitution<T extends { institution_id: number; amount: number }>(
  rows: T[],
  pick: "min" | "max" = "min"
): T[] {
  const byInstitution = new Map<number, T>();
  for (const row of rows) {
    const existing = byInstitution.get(row.institution_id);
    if (!existing) {
      byInstitution.set(row.institution_id, row);
      continue;
    }
    const isBetter = pick === "min" ? row.amount < existing.amount : row.amount > existing.amount;
    if (isBetter) {
      byInstitution.set(row.institution_id, row);
    }
  }
  return [...byInstitution.values()];
}

import { sql } from "@/lib/data-store/connection";
import { getDataFreshness } from "@/lib/data-store/core";
import { computePercentile } from "@/lib/data-store/fees";
import { classifySample, trimOutliers, type SampleClass } from "./sample-policy";

/**
 * The one canonical benchmark per fee category, computed live from
 * published_fee_catalog. Every page that shows a headline median,
 * percentile, or institution/observation count for a fee category must
 * read from here (or from getFeeCategorySummaries/getNationalIndexCached,
 * which delegate to this module) so the numbers agree everywhere.
 *
 * Definition (see /methodology):
 *   - priced = amount > 0
 *   - institution_count = distinct institution_id among priced rows
 *   - observation_count = distinct (institution_id, fee_name, amount,
 *     frequency, variant_type) among priced rows
 *   - percentiles = linear interpolation over each institution's
 *     *minimum* priced amount, so tiered fee rows do not let one
 *     institution count multiple times in the distribution.
 *   - outliers (see sample-policy.ts: trimOutliers) are excluded from the
 *     percentile/min/max math but still counted in institution_count, and
 *     surfaced via outlier_flagged so callers can note they were excluded.
 *   - sample (see sample-policy.ts: classifySample) tells callers whether
 *     institution_count is enough to publish a benchmark at all.
 */
export type CanonicalBenchmark = {
  fee_category: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  institution_count: number;
  observation_count: number;
  outlier_flagged: number;
  sample: SampleClass;
  as_of: string | null;
};

type PricedRow = { institution_id: number; amount: number | null };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure aggregation over one fee category's rows. Callers are responsible
 * for deduping raw catalog rows to distinct (institution_id, fee_name,
 * amount, frequency, variant_type) observations before calling this —
 * each entry here is treated as one observation.
 */
export function computeBenchmark(
  rows: PricedRow[]
): Omit<CanonicalBenchmark, "fee_category" | "as_of"> {
  const priced = rows.filter((r) => r.amount !== null && r.amount > 0);
  const observation_count = priced.length;

  const minByInstitution = new Map<number, number>();
  for (const row of priced) {
    const amount = row.amount as number;
    const existing = minByInstitution.get(row.institution_id);
    if (existing === undefined || amount < existing) {
      minByInstitution.set(row.institution_id, amount);
    }
  }

  const institution_count = minByInstitution.size;
  const amounts = [...minByInstitution.values()].sort((a, b) => a - b);
  const sample = classifySample(institution_count);

  if (amounts.length === 0) {
    return {
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      institution_count,
      observation_count,
      outlier_flagged: 0,
      sample,
    };
  }

  // A single mis-extracted extreme (e.g. a $5,000 "monthly maintenance" fee)
  // must not drag the median/percentiles or set min/max; it is still one of
  // the institutions counted above, just excluded from the price math below.
  const { kept, flagged } = trimOutliers(amounts);
  const priceBasis = kept.length > 0 ? kept : amounts;

  return {
    median: round2(computePercentile(priceBasis, 50)),
    p25: round2(computePercentile(priceBasis, 25)),
    p75: round2(computePercentile(priceBasis, 75)),
    min: priceBasis[0],
    max: priceBasis[priceBasis.length - 1],
    institution_count,
    observation_count,
    outlier_flagged: flagged.length,
    sample,
  };
}

interface CatalogRow {
  fee_category: string;
  institution_id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  variant_type: string | null;
}

async function computeCanonicalBenchmarks(): Promise<Record<string, CanonicalBenchmark>> {
  const rows = await sql<CatalogRow[]>`
    SELECT ef.fee_category, ef.institution_id, ef.fee_name, ef.amount, ef.frequency, ef.variant_type
    FROM published_fee_catalog ef
    WHERE ef.review_status = 'approved' AND ef.fee_category IS NOT NULL`;

  const freshness = await getDataFreshness().catch(() => null);
  const asOf = freshness?.last_fee_extracted_at ?? null;

  // Dedupe to distinct (institution_id, fee_name, amount, frequency, variant_type)
  // observations per category before handing rows to computeBenchmark.
  const dedupedByCategory = new Map<string, Map<string, PricedRow>>();
  for (const row of rows) {
    const category = row.fee_category;
    if (!dedupedByCategory.has(category)) {
      dedupedByCategory.set(category, new Map());
    }
    const institutionId = Number(row.institution_id);
    const amount = row.amount !== null ? Number(row.amount) : null;
    const dedupeKey = `${institutionId}|${row.fee_name}|${amount}|${row.frequency ?? ""}|${row.variant_type ?? ""}`;
    dedupedByCategory.get(category)!.set(dedupeKey, { institution_id: institutionId, amount });
  }

  const result: Record<string, CanonicalBenchmark> = {};
  for (const [category, deduped] of dedupedByCategory.entries()) {
    result[category] = {
      fee_category: category,
      as_of: asOf,
      ...computeBenchmark([...deduped.values()]),
    };
  }
  return result;
}

const TTL_MS = 60 * 60 * 1000;
let benchmarksCache: { expiresAt: number; value: Record<string, CanonicalBenchmark> } | null = null;
let benchmarksPromise: Promise<Record<string, CanonicalBenchmark>> | null = null;

/** All canonical benchmarks, cached 1h in-process with in-flight dedupe. */
export async function getCanonicalBenchmarks(): Promise<Record<string, CanonicalBenchmark>> {
  const now = Date.now();
  if (benchmarksCache && benchmarksCache.expiresAt > now) {
    return benchmarksCache.value;
  }
  if (benchmarksPromise) {
    return benchmarksPromise;
  }

  benchmarksPromise = computeCanonicalBenchmarks()
    .then((value) => {
      benchmarksCache = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    })
    .finally(() => {
      benchmarksPromise = null;
    });
  return benchmarksPromise;
}

export async function getCanonicalBenchmark(category: string): Promise<CanonicalBenchmark | null> {
  const benchmarks = await getCanonicalBenchmarks();
  return benchmarks[category] ?? null;
}

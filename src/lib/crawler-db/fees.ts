import { getDb } from "./connection";
import type { FeeReview } from "./types";

export interface FeeCategorySummary {
  fee_category: string;
  institution_count: number;
  total_observations: number;
  min_amount: number | null;
  max_amount: number | null;
  avg_amount: number | null;
  median_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
  bank_count: number;
  cu_count: number;
}

export interface FeeInstance {
  id: number;
  institution_name: string;
  crawl_target_id: number;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  charter_type: string;
  state_code: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  review_status: string;
  extraction_confidence: number;
}

export interface DimensionBreakdown {
  dimension_value: string;
  count: number;
  min_amount: number | null;
  max_amount: number | null;
  avg_amount: number | null;
  median_amount: number | null;
}

export interface FeeChangeEvent {
  institution_name: string;
  previous_amount: number | null;
  new_amount: number | null;
  change_type: string;
  detected_at: string;
}

export function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

const WINSORIZE_MIN_N = 20;

export function computeStats(amounts: number[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
} {
  if (amounts.length === 0) {
    return { min: null, max: null, avg: null, median: null, p25: null, p75: null };
  }
  const sorted = [...amounts].sort((a, b) => a - b);

  const trueMin = sorted[0];
  const trueMax = sorted[sorted.length - 1];

  let working = sorted;
  if (sorted.length >= WINSORIZE_MIN_N) {
    const p5 = computePercentile(sorted, 5);
    const p95 = computePercentile(sorted, 95);
    working = sorted.map((v) => Math.min(Math.max(v, p5), p95));
  }

  return {
    min: trueMin,
    max: trueMax,
    avg: Math.round((working.reduce((s, v) => s + v, 0) / working.length) * 100) / 100,
    median: Math.round(computePercentile(working, 50) * 100) / 100,
    p25: Math.round(computePercentile(working, 25) * 100) / 100,
    p75: Math.round(computePercentile(working, 75) * 100) / 100,
  };
}

export function getFeeCategorySummaries(): FeeCategorySummary[] {
  const db = getDb();
  const grouped = new Map<
    string,
    { amounts: number[]; banks: Set<number>; cus: Set<number>; total: number }
  >();

  const rows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount, ef.crawl_target_id, ct.charter_type
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.fee_category IS NOT NULL`
    )
    .all() as {
    fee_category: string;
    amount: number | null;
    crawl_target_id: number;
    charter_type: string;
  }[];

  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, { amounts: [], banks: new Set(), cus: new Set(), total: 0 });
    }
    const entry = grouped.get(row.fee_category)!;
    entry.total++;
    if (row.amount !== null && row.amount > 0) {
      entry.amounts.push(row.amount);
    }
    if (row.charter_type === "bank") {
      entry.banks.add(row.crawl_target_id);
    } else {
      entry.cus.add(row.crawl_target_id);
    }
  }

  const results: FeeCategorySummary[] = [];
  for (const [category, data] of grouped.entries()) {
    const stats = computeStats(data.amounts);
    results.push({
      fee_category: category,
      institution_count: new Set([...data.banks, ...data.cus]).size,
      total_observations: data.total,
      bank_count: data.banks.size,
      cu_count: data.cus.size,
      min_amount: stats.min,
      max_amount: stats.max,
      avg_amount: stats.avg,
      median_amount: stats.median,
      p25_amount: stats.p25,
      p75_amount: stats.p75,
    });
  }

  results.sort((a, b) => b.institution_count - a.institution_count);
  return results;
}

export function getFeeCategoryDetail(category: string): {
  fees: FeeInstance[];
  by_charter_type: DimensionBreakdown[];
  by_asset_tier: DimensionBreakdown[];
  by_fed_district: DimensionBreakdown[];
  by_state: DimensionBreakdown[];
  change_events: FeeChangeEvent[];
} {
  const db = getDb();
  const fees = db
    .prepare(
      `SELECT ef.id, ct.institution_name, ef.crawl_target_id,
              ef.amount, ef.frequency, ef.conditions,
              ct.charter_type, ct.state_code, ct.asset_size_tier,
              ct.asset_size, ef.review_status, ef.extraction_confidence
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.fee_category = ?
       ORDER BY ef.amount DESC NULLS LAST`
    )
    .all(category) as FeeInstance[];

  function buildBreakdown(
    dimFn: (f: FeeInstance) => string | null
  ): DimensionBreakdown[] {
    const groups = new Map<string, number[]>();
    for (const fee of fees) {
      const dim = dimFn(fee) ?? "Unknown";
      if (!groups.has(dim)) groups.set(dim, []);
      if (fee.amount !== null && fee.amount > 0) {
        groups.get(dim)!.push(fee.amount);
      }
    }
    const result: DimensionBreakdown[] = [];
    for (const [value, amounts] of groups.entries()) {
      const s = computeStats(amounts);
      result.push({
        dimension_value: value,
        count: amounts.length,
        min_amount: s.min,
        max_amount: s.max,
        avg_amount: s.avg,
        median_amount: s.median,
      });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  const by_charter_type = buildBreakdown((f) => f.charter_type === "bank" ? "Bank" : "Credit Union");
  const by_asset_tier = buildBreakdown((f) => f.asset_size_tier);
  const by_fed_district = buildBreakdown((f) =>
    f.state_code ? `District` : null
  );

  const districtRows = db
    .prepare(
      `SELECT ct.fed_district, ef.amount
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.fee_category = ? AND ct.fed_district IS NOT NULL`
    )
    .all(category) as { fed_district: number; amount: number | null }[];

  const districtGroups = new Map<number, number[]>();
  for (const row of districtRows) {
    if (!districtGroups.has(row.fed_district)) districtGroups.set(row.fed_district, []);
    if (row.amount !== null && row.amount > 0) {
      districtGroups.get(row.fed_district)!.push(row.amount);
    }
  }
  const by_fed_district_real: DimensionBreakdown[] = [];
  for (const [district, amounts] of districtGroups.entries()) {
    const s = computeStats(amounts);
    by_fed_district_real.push({
      dimension_value: `District ${district}`,
      count: amounts.length,
      min_amount: s.min,
      max_amount: s.max,
      avg_amount: s.avg,
      median_amount: s.median,
    });
  }
  by_fed_district_real.sort((a, b) => {
    const numA = parseInt(a.dimension_value.replace("District ", ""));
    const numB = parseInt(b.dimension_value.replace("District ", ""));
    return numA - numB;
  });

  const by_state = buildBreakdown((f) => f.state_code);

  const change_events = db
    .prepare(
      `SELECT ct.institution_name, fce.previous_amount, fce.new_amount,
              fce.change_type, fce.detected_at
       FROM fee_change_events fce
       JOIN crawl_targets ct ON fce.crawl_target_id = ct.id
       WHERE fce.fee_category = ?
       ORDER BY fce.detected_at DESC
       LIMIT 50`
    )
    .all(category) as FeeChangeEvent[];

  return {
    fees,
    by_charter_type,
    by_asset_tier,
    by_fed_district: by_fed_district_real,
    by_state: by_state.slice(0, 15),
    change_events,
  };
}

export function getAuditTrail(feeId: number): FeeReview[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, fee_id, action, username, previous_status, new_status,
              previous_values, new_values, notes, created_at
       FROM fee_reviews
       WHERE fee_id = ?
       ORDER BY created_at DESC`
    )
    .all(feeId) as FeeReview[];
}

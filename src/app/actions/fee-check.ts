"use server";

import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db";
import {
  getSpotlightCategories,
  getDisplayName,
  getFeeFamily,
} from "@/lib/fee-taxonomy";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";

export interface FeeCheckRow {
  category: string;
  display_name: string;
  family: string | null;
  national_median: number | null;
  local_median: number | null;
  delta_pct: number | null;
  local_count: number;
  national_count: number;
}

export interface FeeCheckResult {
  rows: FeeCheckRow[];
  district: number;
  district_name: string;
  state_code: string;
  total_local_institutions: number;
  total_national_institutions: number;
  avg_delta_pct: number | null;
  above_count: number;
  below_count: number;
}

export async function checkFeesForState(
  stateCode: string
): Promise<FeeCheckResult | null> {
  const upper = stateCode.toUpperCase();
  const district = STATE_TO_DISTRICT[upper];
  if (!district) return null;

  const spotlight = getSpotlightCategories();
  const national = getNationalIndex();
  const local = getPeerIndex({ fed_districts: [district] });

  const nationalMap = new Map(national.map((e) => [e.fee_category, e]));
  const localMap = new Map(local.map((e) => [e.fee_category, e]));

  const rows: FeeCheckRow[] = [];

  for (const cat of spotlight) {
    const nat = nationalMap.get(cat);
    const loc = localMap.get(cat);

    const natMedian = nat?.median_amount ?? null;
    const locMedian = loc?.median_amount ?? null;

    let delta: number | null = null;
    if (natMedian != null && locMedian != null && natMedian > 0) {
      delta = ((locMedian - natMedian) / natMedian) * 100;
    }

    rows.push({
      category: cat,
      display_name: getDisplayName(cat),
      family: getFeeFamily(cat),
      national_median: natMedian,
      local_median: locMedian,
      delta_pct: delta,
      local_count: loc?.institution_count ?? 0,
      national_count: nat?.institution_count ?? 0,
    });
  }

  const deltas = rows
    .filter((r) => r.delta_pct != null)
    .map((r) => r.delta_pct!);
  const avgDelta =
    deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  const maxLocalInst = Math.max(...local.map((e) => e.institution_count), 0);
  const maxNatInst = Math.max(...national.map((e) => e.institution_count), 0);

  return {
    rows,
    district,
    district_name: DISTRICT_NAMES[district] ?? `District ${district}`,
    state_code: upper,
    total_local_institutions: maxLocalInst,
    total_national_institutions: maxNatInst,
    avg_delta_pct: avgDelta,
    above_count: deltas.filter((d) => d > 2).length,
    below_count: deltas.filter((d) => d < -2).length,
  };
}

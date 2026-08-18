/**
 * Pure per-city fee aggregation used by /fees/city/[state]/[city].
 * Kept free of SQL so the "N institutions reporting" logic is unit-testable.
 */
import { computePercentile } from "../benchmarks/percentile";

const MEDIAN_PERCENTILE = 50;

export interface CityFeeAverage {
  fee_category: string;
  median: number;
  institution_count: number;
}

export interface CityInstitutionFeeRow {
  institution_id: number | string;
  fee_category: string;
  amount: number | string | null;
}

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure aggregation for city fee cards/tables: one value per institution per category
 * (the lowest published consumer-facing amount, matching the report methodology and
 * the per-institution columns on the city page), then a per-category median across
 * every institution listed on the page. A single reporting institution still counts.
 */
export function aggregateCityFeeAverages(rows: CityInstitutionFeeRow[]): CityFeeAverage[] {
  const perInstitution = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const amount = toAmount(row.amount);
    const id = Number(row.institution_id);
    if (!row.fee_category || amount === null || amount < 0 || !Number.isFinite(id)) continue;
    const byInstitution = perInstitution.get(row.fee_category) ?? new Map<number, number>();
    const current = byInstitution.get(id);
    byInstitution.set(id, current === undefined ? amount : Math.min(current, amount));
    perInstitution.set(row.fee_category, byInstitution);
  }

  return [...perInstitution.entries()]
    .map(([fee_category, byInstitution]) => {
      const values = [...byInstitution.values()].sort((a, b) => a - b);
      const median = computePercentile(values, MEDIAN_PERCENTILE);
      return {
        fee_category,
        median: Math.round(median * 100) / 100,
        institution_count: values.length,
      };
    })
    .sort((a, b) => b.institution_count - a.institution_count || a.fee_category.localeCompare(b.fee_category));
}

/** City pages below this many fee-reporting institutions are noindexed and left out of the sitemap. */
export const MIN_INDEXABLE_CITY_INSTITUTIONS = 3;

/** Fee categories shown as spotlight cards on the city page. */
export const CITY_SPOTLIGHT_CATEGORIES = [
  "overdraft",
  "monthly_maintenance",
  "nsf",
  "atm_non_network",
] as const;

function hasSpotlightData(cityAverages: Pick<CityFeeAverage, "fee_category">[]): boolean {
  return CITY_SPOTLIGHT_CATEGORIES.some((category) =>
    cityAverages.some((avg) => avg.fee_category === category),
  );
}

/**
 * Single indexability rule shared by the city page (`generateMetadata`'s
 * robots directive, and its "honest empty state" branch) and the sitemap, so
 * both agree on what counts as a real city page: enough reporting
 * institutions AND at least one spotlight fee category with data.
 */
export function isCityIndexable(
  institutionCount: number,
  cityAverages: Pick<CityFeeAverage, "fee_category">[],
): boolean {
  return institutionCount >= MIN_INDEXABLE_CITY_INSTITUTIONS && hasSpotlightData(cityAverages);
}


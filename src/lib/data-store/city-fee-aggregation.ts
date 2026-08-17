/**
 * Pure per-city fee aggregation used by /fees/city/[state]/[city].
 * Kept free of SQL so the "N institutions reporting" logic is unit-testable.
 */
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
 * the per-institution columns on the city page), then a per-category average across
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
      const values = [...byInstitution.values()];
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        fee_category,
        median: Math.round((sum / values.length) * 100) / 100,
        institution_count: values.length,
      };
    })
    .sort((a, b) => b.institution_count - a.institution_count || a.fee_category.localeCompare(b.fee_category));
}


import { getDb } from "./connection";
import { computeStats } from "./fees";

export interface ComparisonInstitution {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string;
  asset_size_tier: string | null;
  fed_district: number | null;
}

export interface ComparisonFee {
  fee_category: string;
  amount_a: number | null;
  amount_b: number | null;
  national_median: number | null;
}

export interface ComparisonResult {
  institution_a: ComparisonInstitution;
  institution_b: ComparisonInstitution;
  fees: ComparisonFee[];
  shared_count: number;
  a_cheaper_count: number;
  b_cheaper_count: number;
  tied_count: number;
}

export function getComparisonData(
  idA: number,
  idB: number
): ComparisonResult | null {
  const db = getDb();

  const instA = db
    .prepare(
      `SELECT id, institution_name, city, state_code, charter_type,
              asset_size_tier, fed_district
       FROM crawl_targets WHERE id = ?`
    )
    .get(idA) as ComparisonInstitution | undefined;
  const instB = db
    .prepare(
      `SELECT id, institution_name, city, state_code, charter_type,
              asset_size_tier, fed_district
       FROM crawl_targets WHERE id = ?`
    )
    .get(idB) as ComparisonInstitution | undefined;

  if (!instA || !instB) return null;

  const feesA = db
    .prepare(
      `SELECT fee_category, amount
       FROM extracted_fees
       WHERE crawl_target_id = ?
         AND fee_category IS NOT NULL
         AND review_status != 'rejected'`
    )
    .all(idA) as { fee_category: string; amount: number | null }[];

  const feesB = db
    .prepare(
      `SELECT fee_category, amount
       FROM extracted_fees
       WHERE crawl_target_id = ?
         AND fee_category IS NOT NULL
         AND review_status != 'rejected'`
    )
    .all(idB) as { fee_category: string; amount: number | null }[];

  // Build national medians for context
  const nationalRows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount
       FROM extracted_fees ef
       WHERE ef.fee_category IS NOT NULL
         AND ef.review_status != 'rejected'
         AND ef.amount IS NOT NULL
         AND ef.amount > 0`
    )
    .all() as { fee_category: string; amount: number }[];

  const nationalByCategory = new Map<string, number[]>();
  for (const row of nationalRows) {
    if (!nationalByCategory.has(row.fee_category)) {
      nationalByCategory.set(row.fee_category, []);
    }
    nationalByCategory.get(row.fee_category)!.push(row.amount);
  }

  const nationalMedians = new Map<string, number | null>();
  for (const [cat, amounts] of nationalByCategory.entries()) {
    nationalMedians.set(cat, computeStats(amounts).median);
  }

  // Merge fees from both institutions
  const mapA = new Map<string, number | null>();
  for (const f of feesA) mapA.set(f.fee_category, f.amount);
  const mapB = new Map<string, number | null>();
  for (const f of feesB) mapB.set(f.fee_category, f.amount);

  const allCategories = new Set([...mapA.keys(), ...mapB.keys()]);
  const fees: ComparisonFee[] = [];
  let shared = 0;
  let aCheaper = 0;
  let bCheaper = 0;
  let tied = 0;

  for (const cat of allCategories) {
    const amtA = mapA.get(cat) ?? null;
    const amtB = mapB.get(cat) ?? null;
    fees.push({
      fee_category: cat,
      amount_a: amtA,
      amount_b: amtB,
      national_median: nationalMedians.get(cat) ?? null,
    });

    if (amtA !== null && amtA > 0 && amtB !== null && amtB > 0) {
      shared++;
      if (amtA < amtB) aCheaper++;
      else if (amtB < amtA) bCheaper++;
      else tied++;
    }
  }

  fees.sort((a, b) => {
    const bothA = a.amount_a !== null && a.amount_b !== null;
    const bothB = b.amount_a !== null && b.amount_b !== null;
    if (bothA !== bothB) return bothA ? -1 : 1;
    return a.fee_category.localeCompare(b.fee_category);
  });

  return {
    institution_a: instA,
    institution_b: instB,
    fees,
    shared_count: shared,
    a_cheaper_count: aCheaper,
    b_cheaper_count: bCheaper,
    tied_count: tied,
  };
}

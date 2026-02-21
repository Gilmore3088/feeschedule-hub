import { getDb } from "./connection";
import { computeStats } from "./fees";
import { getFeeFamily } from "@/lib/fee-taxonomy";

export interface StateIndexEntry {
  fee_category: string;
  fee_family: string | null;
  state_median: number | null;
  state_p25: number | null;
  state_p75: number | null;
  state_min: number | null;
  state_max: number | null;
  institution_count: number;
  bank_count: number;
  cu_count: number;
}

export interface StateInstitution {
  id: number;
  institution_name: string;
  city: string | null;
  charter_type: string;
  asset_size_tier: string | null;
  fee_count: number;
}

export interface StateSummary {
  state_code: string;
  institution_count: number;
  fee_count: number;
  category_count: number;
}

export function getStateIndex(stateCode: string): StateIndexEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ef.fee_category, ef.amount, ef.crawl_target_id, ct.charter_type
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ct.state_code = ?
         AND ef.fee_category IS NOT NULL
         AND ef.review_status != 'rejected'`
    )
    .all(stateCode.toUpperCase()) as {
    fee_category: string;
    amount: number | null;
    crawl_target_id: number;
    charter_type: string;
  }[];

  const grouped = new Map<
    string,
    { amounts: number[]; banks: Set<number>; cus: Set<number> }
  >();

  for (const row of rows) {
    if (!grouped.has(row.fee_category)) {
      grouped.set(row.fee_category, {
        amounts: [],
        banks: new Set(),
        cus: new Set(),
      });
    }
    const entry = grouped.get(row.fee_category)!;
    if (row.charter_type === "bank") {
      entry.banks.add(row.crawl_target_id);
    } else {
      entry.cus.add(row.crawl_target_id);
    }
    if (row.amount !== null && row.amount > 0) {
      entry.amounts.push(row.amount);
    }
  }

  const results: StateIndexEntry[] = [];
  for (const [category, data] of grouped.entries()) {
    const stats = computeStats(data.amounts);
    results.push({
      fee_category: category,
      fee_family: getFeeFamily(category),
      state_median: stats.median,
      state_p25: stats.p25,
      state_p75: stats.p75,
      state_min: stats.min,
      state_max: stats.max,
      institution_count: new Set([...data.banks, ...data.cus]).size,
      bank_count: data.banks.size,
      cu_count: data.cus.size,
    });
  }

  results.sort((a, b) => b.institution_count - a.institution_count);
  return results;
}

export function getStateInstitutions(
  stateCode: string,
  limit = 25
): StateInstitution[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.charter_type,
              ct.asset_size_tier,
              COUNT(DISTINCT ef.id) as fee_count
       FROM crawl_targets ct
       LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         AND ef.fee_category IS NOT NULL
         AND ef.review_status != 'rejected'
       WHERE ct.state_code = ?
       GROUP BY ct.id
       HAVING fee_count > 0
       ORDER BY fee_count DESC, ct.institution_name ASC
       LIMIT ?`
    )
    .all(stateCode.toUpperCase(), limit) as StateInstitution[];
}

export function getStatesWithData(): StateSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ct.state_code,
              COUNT(DISTINCT ct.id) as institution_count,
              COUNT(DISTINCT ef.id) as fee_count,
              COUNT(DISTINCT ef.fee_category) as category_count
       FROM crawl_targets ct
       JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         AND ef.fee_category IS NOT NULL
         AND ef.review_status != 'rejected'
       WHERE ct.state_code IS NOT NULL
       GROUP BY ct.state_code
       ORDER BY institution_count DESC`
    )
    .all() as StateSummary[];
}

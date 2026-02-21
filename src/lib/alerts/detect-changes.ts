import { getDb } from "@/lib/crawler-db/connection";
import { getDisplayName } from "@/lib/fee-taxonomy";

export interface FeeChange {
  institution_name: string;
  fee_category: string;
  fee_display_name: string;
  old_amount: number;
  new_amount: number;
  change_pct: number;
  snapshot_date: string;
}

export interface BenchmarkShift {
  fee_category: string;
  fee_display_name: string;
  old_median: number;
  new_median: number;
  change_pct: number;
}

export interface AlertDigest {
  period: string;
  fee_increases: FeeChange[];
  fee_decreases: FeeChange[];
  benchmark_shifts: BenchmarkShift[];
  new_institutions: number;
}

/**
 * Detect fee changes in the last N days by comparing fee_snapshots.
 */
export function detectFeeChanges(
  dayWindow = 7,
  thresholdPct = 10
): { increases: FeeChange[]; decreases: FeeChange[] } {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - dayWindow * 24 * 60 * 60 * 1000
  ).toISOString();

  // Find institutions that have multiple snapshots for the same category
  const rows = db
    .prepare(
      `SELECT
        ct.institution_name,
        fs.fee_category,
        fs.amount as new_amount,
        fs.snapshot_date,
        prev.amount as old_amount
       FROM fee_snapshots fs
       JOIN crawl_targets ct ON fs.crawl_target_id = ct.id
       JOIN fee_snapshots prev ON prev.crawl_target_id = fs.crawl_target_id
         AND prev.fee_category = fs.fee_category
         AND prev.snapshot_date < fs.snapshot_date
       WHERE fs.snapshot_date >= ?
         AND fs.amount IS NOT NULL
         AND prev.amount IS NOT NULL
         AND fs.amount != prev.amount
       ORDER BY fs.snapshot_date DESC`
    )
    .all(cutoff) as {
    institution_name: string;
    fee_category: string;
    new_amount: number;
    snapshot_date: string;
    old_amount: number;
  }[];

  const increases: FeeChange[] = [];
  const decreases: FeeChange[] = [];

  // Deduplicate by institution+category (take most recent)
  const seen = new Set<string>();

  for (const row of rows) {
    const key = `${row.institution_name}:${row.fee_category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const changePct =
      row.old_amount !== 0
        ? ((row.new_amount - row.old_amount) / row.old_amount) * 100
        : 100;

    if (Math.abs(changePct) < thresholdPct) continue;

    const change: FeeChange = {
      institution_name: row.institution_name,
      fee_category: row.fee_category,
      fee_display_name: getDisplayName(row.fee_category),
      old_amount: row.old_amount,
      new_amount: row.new_amount,
      change_pct: Math.round(changePct * 10) / 10,
      snapshot_date: row.snapshot_date,
    };

    if (changePct > 0) increases.push(change);
    else decreases.push(change);
  }

  return { increases, decreases };
}

/**
 * Count institutions added in the last N days.
 */
export function countNewInstitutions(dayWindow = 7): number {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - dayWindow * 24 * 60 * 60 * 1000
  ).toISOString();

  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM crawl_targets WHERE created_at >= ?"
    )
    .get(cutoff) as { cnt: number };

  return row.cnt;
}

/**
 * Build the complete weekly alert digest.
 */
export function buildWeeklyDigest(): AlertDigest {
  const { increases, decreases } = detectFeeChanges(7, 10);
  const newInstitutions = countNewInstitutions(7);

  return {
    period: `${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}`,
    fee_increases: increases.slice(0, 20),
    fee_decreases: decreases.slice(0, 20),
    benchmark_shifts: [],
    new_institutions: newInstitutions,
  };
}

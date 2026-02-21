import { getDb } from "./connection";
import { getDisplayName, getFeeFamily } from "@/lib/fee-taxonomy";

export interface TrendPoint {
  date: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
}

export interface CategoryTrend {
  fee_category: string;
  display_name: string;
  fee_family: string | null;
  points: TrendPoint[];
}

function computePercentile(
  sorted: number[],
  pct: number
): number | null {
  if (sorted.length === 0) return null;
  const idx = (pct / 100) * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
}

/**
 * Get monthly trend data for a fee category over the last N months.
 * Uses fee_snapshots to compute monthly medians.
 */
export function getCategoryTrend(
  category: string,
  months = 12
): CategoryTrend {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT snapshot_date, amount
       FROM fee_snapshots
       WHERE fee_category = ?
         AND snapshot_date >= ?
         AND amount IS NOT NULL
       ORDER BY snapshot_date`
    )
    .all(category, cutoffStr) as { snapshot_date: string; amount: number }[];

  // Group by month
  const byMonth = new Map<string, number[]>();
  for (const row of rows) {
    const month = row.snapshot_date.slice(0, 7); // YYYY-MM
    const arr = byMonth.get(month) || [];
    arr.push(row.amount);
    byMonth.set(month, arr);
  }

  const points: TrendPoint[] = [];
  for (const [date, amounts] of byMonth) {
    amounts.sort((a, b) => a - b);
    points.push({
      date,
      median: computePercentile(amounts, 50),
      p25: computePercentile(amounts, 25),
      p75: computePercentile(amounts, 75),
      count: amounts.length,
    });
  }

  return {
    fee_category: category,
    display_name: getDisplayName(category),
    fee_family: getFeeFamily(category),
    points,
  };
}

/**
 * Get trending categories (those with the most data points in snapshots).
 */
export function getTrendingCategories(limit = 15): {
  fee_category: string;
  display_name: string;
  snapshot_count: number;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT fee_category, COUNT(*) as snapshot_count
       FROM fee_snapshots
       WHERE amount IS NOT NULL
       GROUP BY fee_category
       ORDER BY snapshot_count DESC
       LIMIT ?`
    )
    .all(limit) as { fee_category: string; snapshot_count: number }[];

  return rows.map((r) => ({
    fee_category: r.fee_category,
    display_name: getDisplayName(r.fee_category),
    snapshot_count: r.snapshot_count,
  }));
}

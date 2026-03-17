import { getDb } from "@/lib/crawler-db/connection";
import { getDisplayName, getFeeFamily, getFeeTier, FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { CategoryCoverageTable } from "./category-coverage";

function getCategoryCoverage() {
  const db = getDb();

  const totalInstitutions = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets").get() as { c: number }).c;

  // Only show the 49 official taxonomy categories, not long-tail fee names
  const officialCategories = Object.keys(DISPLAY_NAMES);
  const placeholders = officialCategories.map(() => "?").join(",");

  const rows = db.prepare(`
    SELECT fee_category,
           COUNT(*) as total,
           SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN review_status = 'staged' THEN 1 ELSE 0 END) as staged,
           SUM(CASE WHEN review_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
           SUM(CASE WHEN amount IS NOT NULL AND amount >= 0 THEN 1 ELSE 0 END) as has_amount,
           COUNT(DISTINCT crawl_target_id) as institutions
    FROM extracted_fees
    WHERE fee_category IN (${placeholders}) AND review_status != 'rejected'
    GROUP BY fee_category
    ORDER BY total DESC
  `).all(...officialCategories) as {
    fee_category: string;
    total: number;
    approved: number;
    staged: number;
    flagged: number;
    has_amount: number;
    institutions: number;
  }[];

  // Fetch all category-state pairs in ONE query instead of 49 separate queries
  const statesByCategory = new Map<string, { state: string; count: number }[]>();
  try {
    const allStates = db.prepare(`
      SELECT ef.fee_category, ct.state_code as state, COUNT(*) as count
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      WHERE ef.fee_category IN (${placeholders}) AND ef.review_status != 'rejected'
      GROUP BY ef.fee_category, ct.state_code
      ORDER BY ef.fee_category, count DESC
    `).all(...officialCategories) as { fee_category: string; state: string; count: number }[];

    for (const row of allStates) {
      const arr = statesByCategory.get(row.fee_category) || [];
      if (arr.length < 6) arr.push({ state: row.state, count: row.count });
      statesByCategory.set(row.fee_category, arr);
    }
  } catch {
    // skip if query fails
  }

  const categories = rows.map((r) => ({
    fee_category: r.fee_category,
    display_name: getDisplayName(r.fee_category),
    family: getFeeFamily(r.fee_category) || "Other",
    tier: getFeeTier(r.fee_category) || "other",
    total: r.total,
    approved: r.approved,
    staged: r.staged,
    flagged: r.flagged,
    has_amount: r.has_amount,
    institutions: r.institutions,
    approval_rate: r.total > 0 ? (r.approved / r.total) * 100 : 0,
    top_states: statesByCategory.get(r.fee_category) || [],
  }));

  const families = Object.keys(FEE_FAMILIES);

  return { categories, totalInstitutions, families };
}

export function CategoryCoverageDashboard() {
  const { categories, totalInstitutions, families } = getCategoryCoverage();
  return (
    <CategoryCoverageTable
      categories={categories}
      totalInstitutions={totalInstitutions}
      families={families}
    />
  );
}

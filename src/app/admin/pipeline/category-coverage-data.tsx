import { sql } from "@/lib/crawler-db/connection";
import { getDisplayName, getFeeFamily, getFeeTier, FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { CategoryCoverageTable } from "./category-coverage";

async function getCategoryCoverage() {
  const [totalRow] = await sql`SELECT COUNT(*) as c FROM crawl_targets`;
  const totalInstitutions = Number(totalRow.c);

  // Only show the 49 official taxonomy categories, not long-tail fee names
  const officialCategories = Object.keys(DISPLAY_NAMES);

  const rows = await sql`
    SELECT fee_category,
           COUNT(*) as total,
           SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN review_status = 'staged' THEN 1 ELSE 0 END) as staged,
           SUM(CASE WHEN review_status = 'flagged' THEN 1 ELSE 0 END) as flagged,
           SUM(CASE WHEN amount IS NOT NULL AND amount >= 0 THEN 1 ELSE 0 END) as has_amount,
           COUNT(DISTINCT crawl_target_id) as institutions
    FROM extracted_fees
    WHERE fee_category = ANY(${officialCategories}) AND review_status != 'rejected'
    GROUP BY fee_category
    ORDER BY total DESC
  `;

  // Fetch all category-state pairs in ONE query
  const statesByCategory = new Map<string, { state: string; count: number }[]>();
  try {
    const allStates = await sql`
      SELECT ef.fee_category, ct.state_code as state, COUNT(*) as count
      FROM extracted_fees ef
      JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
      WHERE ef.fee_category = ANY(${officialCategories}) AND ef.review_status != 'rejected'
      GROUP BY ef.fee_category, ct.state_code
      ORDER BY ef.fee_category, count DESC
    `;

    for (const row of allStates) {
      const arr = statesByCategory.get(row.fee_category) || [];
      if (arr.length < 6) arr.push({ state: row.state, count: Number(row.count) });
      statesByCategory.set(row.fee_category, arr);
    }
  } catch {
    // skip if query fails
  }

  const categories = rows.map((r) => ({
    fee_category: r.fee_category as string,
    display_name: getDisplayName(r.fee_category as string),
    family: getFeeFamily(r.fee_category as string) || "Other",
    tier: getFeeTier(r.fee_category as string) || "other",
    total: Number(r.total),
    approved: Number(r.approved),
    staged: Number(r.staged),
    flagged: Number(r.flagged),
    has_amount: Number(r.has_amount),
    institutions: Number(r.institutions),
    approval_rate: Number(r.total) > 0 ? (Number(r.approved) / Number(r.total)) * 100 : 0,
    top_states: statesByCategory.get(r.fee_category as string) || [],
  }));

  const families = Object.keys(FEE_FAMILIES);

  return { categories, totalInstitutions, families };
}

export async function CategoryCoverageDashboard() {
  const { categories, totalInstitutions, families } = await getCategoryCoverage();
  return (
    <CategoryCoverageTable
      categories={categories}
      totalInstitutions={totalInstitutions}
      families={families}
    />
  );
}

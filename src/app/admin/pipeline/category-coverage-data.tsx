import { getDb } from "@/lib/crawler-db/connection";
import { getDisplayName, getFeeFamily } from "@/lib/fee-taxonomy";
import { CategoryCoverageTable } from "./category-coverage";

function getCategoryCoverage() {
  const db = getDb();

  const totalInstitutions = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets").get() as { c: number }).c;

  const rows = db.prepare(`
    SELECT fee_category,
           COUNT(*) as total,
           SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN amount IS NOT NULL AND amount > 0 THEN 1 ELSE 0 END) as has_amount,
           COUNT(DISTINCT crawl_target_id) as institutions
    FROM extracted_fees
    WHERE fee_category IS NOT NULL AND fee_category != '' AND review_status != 'rejected'
    GROUP BY fee_category
    ORDER BY total DESC
  `).all() as { fee_category: string; total: number; approved: number; has_amount: number; institutions: number }[];

  const categories = rows.map((r) => ({
    fee_category: r.fee_category,
    display_name: getDisplayName(r.fee_category),
    family: getFeeFamily(r.fee_category) || "Other",
    total: r.total,
    approved: r.approved,
    has_amount: r.has_amount,
    institutions: r.institutions,
    approval_rate: r.total > 0 ? (r.approved / r.total) * 100 : 0,
  }));

  return { categories, totalInstitutions };
}

export function CategoryCoverageDashboard() {
  const { categories, totalInstitutions } = getCategoryCoverage();
  return <CategoryCoverageTable categories={categories} totalInstitutions={totalInstitutions} />;
}

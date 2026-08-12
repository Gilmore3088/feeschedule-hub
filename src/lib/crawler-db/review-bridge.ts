import { sql } from "./connection";
import type { ReviewStats, ReviewableFee } from "./types";

export async function getReviewStats(): Promise<ReviewStats> {
  const rows = await sql<{ review_status: string; cnt: number }[]>`
    SELECT review_status, COUNT(*) as cnt
    FROM extracted_fees
    GROUP BY review_status
  `;

  const stats: ReviewStats = {
    pending: 0,
    staged: 0,
    flagged: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of rows) {
    if (row.review_status in stats) {
      stats[row.review_status as keyof ReviewStats] = Number(row.cnt);
    }
  }
  return stats;
}

export async function getFeeById(feeId: number): Promise<ReviewableFee | null> {
  const [row] = await sql<ReviewableFee[]>`
    SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            ef.extraction_confidence, ef.review_status, ef.validation_flags,
            ef.fee_category, ct.institution_name, ef.crawl_target_id,
            ct.state_code, ct.charter_type, cr.document_url, ct.fee_schedule_url
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
     WHERE ef.id = ${feeId}
  `;
  return row ?? null;
}

export async function getOutlierFlaggedFees(
  limit = 100,
  offset = 0,
  category?: string,
  sort?: string,
  dir?: string,
): Promise<{ fees: ReviewableFee[]; total: number }> {
  const conditions = [
    "ef.review_status IN ('flagged', 'pending', 'staged')",
    `(ef.validation_flags::text LIKE '%statistical_outlier%'
      OR ef.validation_flags::text LIKE '%decimal_error%'
      OR ef.validation_flags::text LIKE '%percentage_confusion%')`,
  ];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (category) {
    conditions.push(`ef.fee_category = $${paramIdx++}`);
    params.push(category);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await sql.unsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     ${where}`,
    params,
  );
  const cnt = Number(countResult[0].cnt);

  const fees = await sql.unsafe<ReviewableFee[]>(
    `SELECT ef.id, ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            ef.extraction_confidence, ef.review_status, ef.validation_flags,
            ef.fee_category, ct.institution_name, ef.crawl_target_id,
            ct.state_code, ct.charter_type, cr.document_url, ct.fee_schedule_url
     FROM extracted_fees ef
     JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
     LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
     ${where}
     ORDER BY ${getReviewSortClause(sort, dir, "ef.extraction_confidence ASC, ef.amount DESC")}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  return { fees, total: cnt };
}

function getReviewSortClause(sort?: string, dir?: string, fallback = "ef.id DESC"): string {
  const SORT_MAP: Record<string, string> = {
    amount: "ef.amount",
    confidence: "ef.extraction_confidence",
    name: "ef.fee_name",
    institution: "ct.institution_name",
    category: "ef.fee_category",
    state: "ct.state_code",
  };
  const col = sort && SORT_MAP[sort];
  if (!col) return fallback;
  const direction = dir === "asc" ? "ASC" : "DESC";
  return `${col} ${direction} NULLS LAST`;
}

import { getDb } from "./connection";
import { VALID_US_CODES } from "../us-states";

export interface DataQualityReport {
  invalid_state_codes: { state_code: string; institution_count: number }[];
  uncategorized_fees: number;
  null_amounts: number;
  stale_institutions: number;
  total_institutions: number;
  status_distribution: { review_status: string; count: number }[];
  duplicate_fees: { institution_id: number; institution_name: string; fee_name: string; count: number }[];
  missing_financials: number;
}

export function getInvalidStateCodes(): { state_code: string; institution_count: number }[] {
  const db = getDb();
  const validCodes = [...VALID_US_CODES];
  const placeholders = validCodes.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT state_code, COUNT(*) as institution_count
       FROM crawl_targets
       WHERE state_code IS NOT NULL
         AND state_code NOT IN (${placeholders})
       GROUP BY state_code
       ORDER BY institution_count DESC`
    )
    .all(...validCodes) as { state_code: string; institution_count: number }[];
}

export function getUncategorizedFeeCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees
       WHERE fee_category IS NULL
         AND review_status != 'rejected'`
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function getNullAmountCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM extracted_fees
       WHERE amount IS NULL
         AND review_status != 'rejected'
         AND LOWER(fee_name) NOT LIKE '%free%'
         AND LOWER(fee_name) NOT LIKE '%waived%'
         AND LOWER(fee_name) NOT LIKE '%no charge%'`
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function getStaleInstitutionCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM crawl_targets
       WHERE last_crawl_at < datetime('now', '-90 days')
          OR last_crawl_at IS NULL`
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function getStatusDistribution(): { review_status: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT review_status, COUNT(*) as count
       FROM extracted_fees
       GROUP BY review_status
       ORDER BY count DESC`
    )
    .all() as { review_status: string; count: number }[];
}

export function getDuplicateFees(): { institution_id: number; institution_name: string; fee_name: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ct.id as institution_id,
              ct.institution_name,
              LOWER(TRIM(ef.fee_name)) as fee_name,
              COUNT(*) as count
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ef.review_status != 'rejected'
       GROUP BY ct.id, LOWER(TRIM(ef.fee_name))
       HAVING COUNT(*) > 1
       ORDER BY count DESC
       LIMIT 50`
    )
    .all() as { institution_id: number; institution_name: string; fee_name: string; count: number }[];
}

export function getMissingFinancialsCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM crawl_targets ct
       LEFT JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
       WHERE ifin.id IS NULL`
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function getDataQualityReport(): DataQualityReport {
  const db = getDb();
  const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM crawl_targets").get() as { cnt: number };

  return {
    invalid_state_codes: getInvalidStateCodes(),
    uncategorized_fees: getUncategorizedFeeCount(),
    null_amounts: getNullAmountCount(),
    stale_institutions: getStaleInstitutionCount(),
    total_institutions: totalRow.cnt,
    status_distribution: getStatusDistribution(),
    duplicate_fees: getDuplicateFees(),
    missing_financials: getMissingFinancialsCount(),
  };
}

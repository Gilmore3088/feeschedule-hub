import { sql } from "./connection";
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

export async function getInvalidStateCodes(): Promise<{ state_code: string; institution_count: number }[]> {
  const validCodes = [...VALID_US_CODES];
  return await sql`
    SELECT state_code, COUNT(*) as institution_count
    FROM crawl_targets
    WHERE state_code IS NOT NULL
      AND state_code NOT IN ${sql(validCodes)}
    GROUP BY state_code
    ORDER BY institution_count DESC
  ` as { state_code: string; institution_count: number }[];
}

export async function getUncategorizedFeeCount(): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt
    FROM extracted_fees
    WHERE fee_category IS NULL
      AND review_status != 'rejected'
  `;
  return row.cnt;
}

export async function getNullAmountCount(): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt
    FROM extracted_fees
    WHERE amount IS NULL
      AND review_status != 'rejected'
      AND LOWER(fee_name) NOT LIKE '%free%'
      AND LOWER(fee_name) NOT LIKE '%waived%'
      AND LOWER(fee_name) NOT LIKE '%no charge%'
  `;
  return row.cnt;
}

export async function getStaleInstitutionCount(): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt
    FROM crawl_targets
    WHERE last_crawl_at < NOW() - INTERVAL '90 days'
       OR last_crawl_at IS NULL
  `;
  return row.cnt;
}

export async function getStatusDistribution(): Promise<{ review_status: string; count: number }[]> {
  return await sql`
    SELECT review_status, COUNT(*) as count
    FROM extracted_fees
    GROUP BY review_status
    ORDER BY count DESC
  ` as { review_status: string; count: number }[];
}

export async function getDuplicateFees(): Promise<{ institution_id: number; institution_name: string; fee_name: string; count: number }[]> {
  return await sql`
    SELECT ct.id as institution_id,
           ct.institution_name,
           LOWER(TRIM(ef.fee_name)) as fee_name,
           COUNT(*) as count
    FROM extracted_fees ef
    JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
    WHERE ef.review_status != 'rejected'
    GROUP BY ct.id, ct.institution_name, LOWER(TRIM(ef.fee_name))
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 50
  ` as { institution_id: number; institution_name: string; fee_name: string; count: number }[];
}

export async function getMissingFinancialsCount(): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt
    FROM crawl_targets ct
    LEFT JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
    WHERE ifin.id IS NULL
  `;
  return row.cnt;
}

export async function getDataQualityReport(): Promise<DataQualityReport> {
  const [totalRow] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;

  const [
    invalid_state_codes,
    uncategorized_fees,
    null_amounts,
    stale_institutions,
    status_distribution,
    duplicate_fees,
    missing_financials,
  ] = await Promise.all([
    getInvalidStateCodes(),
    getUncategorizedFeeCount(),
    getNullAmountCount(),
    getStaleInstitutionCount(),
    getStatusDistribution(),
    getDuplicateFees(),
    getMissingFinancialsCount(),
  ]);

  return {
    invalid_state_codes,
    uncategorized_fees,
    null_amounts,
    stale_institutions,
    total_institutions: totalRow.cnt,
    status_distribution,
    duplicate_fees,
    missing_financials,
  };
}

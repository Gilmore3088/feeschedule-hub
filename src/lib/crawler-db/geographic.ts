import { getDb } from "./connection";
import { VALID_US_CODES } from "../us-states";

export interface GeoStats {
  institution_count: number;
  bank_count: number;
  cu_count: number;
  with_fees: number;
  total_fees: number;
  fee_categories: number;
}

export function getStateStats(stateCode: string): GeoStats {
  const db = getDb();

  const inst = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
         SUM(CASE WHEN charter_type = 'credit_union' THEN 1 ELSE 0 END) as cus
       FROM crawl_targets WHERE state_code = ?`
    )
    .get(stateCode) as { total: number; banks: number; cus: number };

  const fees = db
    .prepare(
      `SELECT COUNT(DISTINCT ef.crawl_target_id) as with_fees,
              COUNT(*) as total_fees,
              COUNT(DISTINCT ef.fee_category) as categories
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ct.state_code = ? AND ef.review_status != 'rejected'`
    )
    .get(stateCode) as { with_fees: number; total_fees: number; categories: number };

  return {
    institution_count: inst.total,
    bank_count: inst.banks,
    cu_count: inst.cus,
    with_fees: fees.with_fees,
    total_fees: fees.total_fees,
    fee_categories: fees.categories,
  };
}

export function getDistrictStats(districtId: number): GeoStats {
  const db = getDb();

  const inst = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
         SUM(CASE WHEN charter_type = 'credit_union' THEN 1 ELSE 0 END) as cus
       FROM crawl_targets WHERE fed_district = ?`
    )
    .get(districtId) as { total: number; banks: number; cus: number };

  const fees = db
    .prepare(
      `SELECT COUNT(DISTINCT ef.crawl_target_id) as with_fees,
              COUNT(*) as total_fees,
              COUNT(DISTINCT ef.fee_category) as categories
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ct.fed_district = ? AND ef.review_status != 'rejected'`
    )
    .get(districtId) as { with_fees: number; total_fees: number; categories: number };

  return {
    institution_count: inst.total,
    bank_count: inst.banks,
    cu_count: inst.cus,
    with_fees: fees.with_fees,
    total_fees: fees.total_fees,
    fee_categories: fees.categories,
  };
}

export function getInstitutionIdsWithFees(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT crawl_target_id as id
       FROM extracted_fees
       WHERE review_status != 'rejected'
       ORDER BY crawl_target_id`
    )
    .all() as { id: number }[];
  return rows.map((r) => r.id);
}

export function getStatesWithFeeData(): { state_code: string; institution_count: number; fee_count: number }[] {
  const db = getDb();
  const codes = [...VALID_US_CODES];
  const placeholders = codes.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT ct.state_code,
              COUNT(DISTINCT ct.id) as institution_count,
              COUNT(ef.id) as fee_count
       FROM crawl_targets ct
       JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
       WHERE ct.state_code IN (${placeholders})
         AND ef.review_status != 'rejected'
       GROUP BY ct.state_code
       ORDER BY COUNT(DISTINCT ct.id) DESC`
    )
    .all(...codes) as { state_code: string; institution_count: number; fee_count: number }[];
}

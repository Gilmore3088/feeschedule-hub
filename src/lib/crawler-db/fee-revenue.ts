import { sql } from "./connection";

export interface FeeRevenueCorrelation {
  crawl_target_id: number;
  institution_name: string;
  charter_type: string;
  state_code: string | null;
  asset_size_tier: string | null;
  total_assets: number | null;
  service_charge_income: number | null;
  fee_income_ratio: number | null;
  avg_fee: number;
  fee_count: number;
  median_overdraft: number | null;
}

export async function getFeeRevenueData(): Promise<FeeRevenueCorrelation[]> {
  return await sql`
    SELECT
      ct.id as crawl_target_id,
      ct.institution_name,
      ct.charter_type,
      ct.state_code,
      ct.asset_size_tier,
      ifin.total_assets,
      ifin.service_charge_income,
      CASE WHEN ifin.total_assets > 0
           THEN ROUND(ifin.service_charge_income * 1.0 / ifin.total_assets * 10000, 2)
           ELSE NULL END as fee_income_ratio,
      ROUND(AVG(ef.amount), 2) as avg_fee,
      COUNT(ef.id) as fee_count,
      NULL as median_overdraft
    FROM crawl_targets ct
    JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
    WHERE ef.review_status != 'rejected'
      AND ef.amount IS NOT NULL
      AND ef.amount > 0
      AND ifin.report_date = (
        SELECT MAX(report_date)
        FROM institution_financials i2
        WHERE i2.crawl_target_id = ct.id
      )
      AND ifin.service_charge_income IS NOT NULL
    GROUP BY ct.id, ct.institution_name, ct.charter_type, ct.state_code,
             ct.asset_size_tier, ifin.total_assets, ifin.service_charge_income
    HAVING COUNT(ef.id) >= 3
    ORDER BY ifin.total_assets DESC NULLS LAST
  ` as FeeRevenueCorrelation[];
}

export interface TierFeeRevenueSummary {
  asset_size_tier: string;
  institution_count: number;
  avg_service_charge_income: number;
  avg_fee_amount: number;
  avg_fee_income_ratio: number;
}

export async function getTierFeeRevenueSummary(): Promise<TierFeeRevenueSummary[]> {
  return await sql`
    SELECT
      ct.asset_size_tier,
      COUNT(DISTINCT ct.id) as institution_count,
      ROUND(AVG(ifin.service_charge_income), 0) as avg_service_charge_income,
      ROUND(AVG(ef_avg.avg_fee), 2) as avg_fee_amount,
      ROUND(AVG(
        CASE WHEN ifin.total_assets > 0
             THEN ifin.service_charge_income * 1.0 / ifin.total_assets * 10000
             ELSE NULL END
      ), 2) as avg_fee_income_ratio
    FROM crawl_targets ct
    JOIN (
      SELECT crawl_target_id, AVG(amount) as avg_fee
      FROM extracted_fees
      WHERE review_status != 'rejected' AND amount IS NOT NULL AND amount > 0
      GROUP BY crawl_target_id
      HAVING COUNT(*) >= 3
    ) ef_avg ON ct.id = ef_avg.crawl_target_id
    JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
    WHERE ct.asset_size_tier IS NOT NULL
      AND ifin.service_charge_income IS NOT NULL
      AND ifin.report_date = (
        SELECT MAX(report_date)
        FROM institution_financials i2
        WHERE i2.crawl_target_id = ct.id
      )
    GROUP BY ct.asset_size_tier
    ORDER BY AVG(ifin.total_assets) ASC
  ` as TierFeeRevenueSummary[];
}

export interface CharterFeeRevenueSummary {
  charter_type: string;
  institution_count: number;
  avg_service_charge_income: number;
  avg_fee_amount: number;
  avg_fee_income_ratio: number;
}

export async function getCharterFeeRevenueSummary(): Promise<CharterFeeRevenueSummary[]> {
  return await sql`
    SELECT
      ct.charter_type,
      COUNT(DISTINCT ct.id) as institution_count,
      ROUND(AVG(ifin.service_charge_income), 0) as avg_service_charge_income,
      ROUND(AVG(ef_avg.avg_fee), 2) as avg_fee_amount,
      ROUND(AVG(
        CASE WHEN ifin.total_assets > 0
             THEN ifin.service_charge_income * 1.0 / ifin.total_assets * 10000
             ELSE NULL END
      ), 2) as avg_fee_income_ratio
    FROM crawl_targets ct
    JOIN (
      SELECT crawl_target_id, AVG(amount) as avg_fee
      FROM extracted_fees
      WHERE review_status != 'rejected' AND amount IS NOT NULL AND amount > 0
      GROUP BY crawl_target_id
      HAVING COUNT(*) >= 3
    ) ef_avg ON ct.id = ef_avg.crawl_target_id
    JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
    WHERE ifin.service_charge_income IS NOT NULL
      AND ifin.report_date = (
        SELECT MAX(report_date)
        FROM institution_financials i2
        WHERE i2.crawl_target_id = ct.id
      )
    GROUP BY ct.charter_type
  ` as CharterFeeRevenueSummary[];
}

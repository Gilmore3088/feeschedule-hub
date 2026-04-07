import { getSql } from "./connection";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RevenueConcentration {
  fee_category: string;
  total_service_charges: number; // dollars (scaled * 1000 in SQL per D-09)
  share_pct: number;             // 0-100
  cumulative_pct: number;        // monotonically increasing
  institution_count: number;
}

export interface FeeDependencyRow {
  charter_type: string;
  asset_size_tier: string;
  median_ratio: number;             // SC / total_revenue median
  p25_ratio: number;
  p75_ratio: number;
  institution_count: number;
  total_sc_income: number;          // dollars (per D-09, * 1000)
  overdraft_revenue: number | null; // dollars (per D-08, may be null)
  other_sc_income: number | null;   // total_sc - overdraft (per D-08)
  overdraft_share: number | null;   // overdraft/total_sc pct (per D-08)
}

export interface RevenuePerInstitutionRow {
  charter_type: string;
  asset_size_tier: string;
  avg_sc_income: number;    // dollars (per D-09, * 1000)
  median_sc_income: number; // dollars
  institution_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computePercentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * pct);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  return computePercentile(sorted, 0.5);
}

// ── getRevenueConcentration ───────────────────────────────────────────────────

/**
 * Returns top N fee categories ranked by total service charge income, with
 * share and cumulative share percentages.
 *
 * SQL joins extracted_fees to institution_financials via crawl_target_id,
 * using the latest report_date per institution. Monetary values are scaled
 * * 1000 at SQL level to convert from thousands to dollars.
 * cumulative_pct is computed in TypeScript via reduce.
 */
export async function getRevenueConcentration(
  topN = 5
): Promise<RevenueConcentration[]> {
  try {
    const sql = getSql();
    const rows = await sql.unsafe(
      `WITH latest_financials AS (
        SELECT DISTINCT ON (crawl_target_id)
               crawl_target_id,
               service_charge_income * 1000 AS service_charge_dollars
        FROM institution_financials
        WHERE service_charge_income IS NOT NULL
        ORDER BY crawl_target_id, report_date DESC
      ),
      category_totals AS (
        SELECT
          ef.fee_category,
          SUM(lf.service_charge_dollars)::BIGINT AS total_sc,
          COUNT(DISTINCT ef.crawl_target_id)::INT AS institution_count
        FROM extracted_fees ef
        JOIN latest_financials lf ON lf.crawl_target_id = ef.crawl_target_id
        WHERE ef.fee_category IS NOT NULL
          AND ef.review_status != 'rejected'
        GROUP BY ef.fee_category
      ),
      grand AS (
        SELECT SUM(total_sc) AS grand_total FROM category_totals
      )
      SELECT
        ct.fee_category,
        ct.total_sc,
        ct.institution_count,
        CASE WHEN g.grand_total > 0
          THEN ct.total_sc * 100.0 / g.grand_total
          ELSE 0
        END AS share_pct
      FROM category_totals ct, grand g
      ORDER BY ct.total_sc DESC
      LIMIT $1`,
      [topN]
    ) as {
      fee_category: string;
      total_sc: string | number;
      institution_count: string | number;
      share_pct: string | number;
    }[];

    // Compute cumulative_pct in TypeScript (per research pitfall #3)
    let cumulative = 0;
    return rows.map((row) => {
      const share = Number(row.share_pct);
      cumulative += share;
      return {
        fee_category: row.fee_category,
        total_service_charges: Number(row.total_sc),
        share_pct: share,
        cumulative_pct: cumulative,
        institution_count: Number(row.institution_count),
      };
    });
  } catch (err) {
    console.error("[derived] getRevenueConcentration failed:", err);
    return [];
  }
}

// ── getFeeDependencyRatio ─────────────────────────────────────────────────────

/**
 * Returns fee dependency ratios (service charges / total revenue) grouped by
 * charter type and asset size tier, with overdraft breakdown where available.
 *
 * Uses array_agg to collect per-institution ratios for percentile computation
 * in TypeScript. Monetary fields (total_sc_income, overdraft_revenue) are
 * stored in thousands in the DB and scaled * 1000 in TypeScript.
 */
export async function getFeeDependencyRatio(
  opts?: { charter?: string; tier?: string }
): Promise<FeeDependencyRow[]> {
  try {
    const sql = getSql();

    const filterClauses: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (opts?.charter) {
      filterClauses.push(`ct.charter_type = $${paramIdx++}`);
      params.push(opts.charter);
    }
    if (opts?.tier) {
      filterClauses.push(`ct.asset_size_tier = $${paramIdx++}`);
      params.push(opts.tier);
    }

    const extraWhere = filterClauses.length > 0
      ? `AND ${filterClauses.join(" AND ")}`
      : "";

    const rows = await sql.unsafe(
      `SELECT
        ct.charter_type,
        ct.asset_size_tier,
        array_agg(latest.fee_income_ratio ORDER BY latest.fee_income_ratio) AS ratios,
        SUM(latest.service_charge_income)::BIGINT AS total_sc_income,
        SUM(latest.overdraft_revenue)::BIGINT AS overdraft_revenue,
        COUNT(DISTINCT latest.crawl_target_id)::INT AS institution_count
      FROM (
        SELECT DISTINCT ON (crawl_target_id)
               crawl_target_id,
               fee_income_ratio,
               service_charge_income,
               overdraft_revenue
        FROM institution_financials
        WHERE fee_income_ratio IS NOT NULL
          AND service_charge_income IS NOT NULL
        ORDER BY crawl_target_id, report_date DESC
      ) latest
      JOIN crawl_targets ct ON ct.id = latest.crawl_target_id
      WHERE ct.charter_type IS NOT NULL
        AND ct.asset_size_tier IS NOT NULL
        ${extraWhere}
      GROUP BY ct.charter_type, ct.asset_size_tier
      ORDER BY ct.charter_type, ct.asset_size_tier`,
      params
    ) as {
      charter_type: string;
      asset_size_tier: string;
      ratios: number[] | null;
      total_sc_income: string | number | null;
      overdraft_revenue: string | number | null;
      institution_count: string | number;
    }[];

    return rows.map((row) => {
      const ratios = (row.ratios ?? []).map(Number).sort((a, b) => a - b);
      // Monetary fields stored in thousands; scale * 1000 to dollars (per D-09)
      const totalSc = Number(row.total_sc_income ?? 0) * 1000;
      const odRaw = row.overdraft_revenue != null ? Number(row.overdraft_revenue) : null;
      const odRevenue = odRaw != null ? odRaw * 1000 : null;
      const otherSc = odRevenue != null ? totalSc - odRevenue : null;
      const odShare = odRevenue != null && totalSc > 0
        ? (odRevenue / totalSc) * 100
        : null;

      return {
        charter_type: row.charter_type,
        asset_size_tier: row.asset_size_tier,
        median_ratio: computeMedian(ratios),
        p25_ratio: computePercentile(ratios, 0.25),
        p75_ratio: computePercentile(ratios, 0.75),
        institution_count: Number(row.institution_count),
        total_sc_income: totalSc,
        overdraft_revenue: odRevenue,
        other_sc_income: otherSc,
        overdraft_share: odShare,
      };
    });
  } catch (err) {
    console.error("[derived] getFeeDependencyRatio failed:", err);
    return [];
  }
}

// ── getRevenuePerInstitution ──────────────────────────────────────────────────

/**
 * Returns average and median service charge income per institution, grouped
 * by charter type and asset size tier.
 *
 * Uses array_agg to collect per-institution SC values (in thousands from DB)
 * for median computation in TypeScript. avg_sc and sc_values are in thousands;
 * TypeScript scales * 1000 to dollars (per D-09).
 */
export async function getRevenuePerInstitution(): Promise<RevenuePerInstitutionRow[]> {
  try {
    const sql = getSql();

    const rows = await sql.unsafe(
      `SELECT
        ct.charter_type,
        ct.asset_size_tier,
        AVG(latest.service_charge_income)::BIGINT AS avg_sc,
        array_agg(latest.service_charge_income ORDER BY latest.service_charge_income) AS sc_values,
        COUNT(DISTINCT latest.crawl_target_id)::INT AS institution_count
      FROM (
        SELECT DISTINCT ON (crawl_target_id)
               crawl_target_id,
               service_charge_income
        FROM institution_financials
        WHERE service_charge_income IS NOT NULL
        ORDER BY crawl_target_id, report_date DESC
      ) latest
      JOIN crawl_targets ct ON ct.id = latest.crawl_target_id
      WHERE ct.charter_type IS NOT NULL
        AND ct.asset_size_tier IS NOT NULL
      GROUP BY ct.charter_type, ct.asset_size_tier
      ORDER BY ct.charter_type, ct.asset_size_tier`,
      []
    ) as {
      charter_type: string;
      asset_size_tier: string;
      avg_sc: string | number | null;
      sc_values: number[] | null;
      institution_count: string | number;
    }[];

    return rows.map((row) => {
      // sc_values are in thousands from DB; sort and compute median, then scale
      const scValues = (row.sc_values ?? []).map(Number).sort((a, b) => a - b);
      const medianSc = computeMedian(scValues) * 1000;

      return {
        charter_type: row.charter_type,
        asset_size_tier: row.asset_size_tier,
        avg_sc_income: Number(row.avg_sc ?? 0) * 1000,
        median_sc_income: medianSc,
        institution_count: Number(row.institution_count),
      };
    });
  } catch (err) {
    console.error("[derived] getRevenuePerInstitution failed:", err);
    return [];
  }
}

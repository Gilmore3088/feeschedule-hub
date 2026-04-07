import { getSql } from "./connection";

export interface RevenueSnapshot {
  quarter: string;
  total_service_charges: number;
  total_institutions: number;
  bank_service_charges: number;
  cu_service_charges: number;
  yoy_change_pct: number | null;
}

export interface RevenueTrend {
  quarters: RevenueSnapshot[];
  latest: RevenueSnapshot | null;
}

export interface TopRevenueInstitution {
  cert_number: string;
  institution_name: string | null;
  charter_type: string;
  report_date: string;
  service_charge_income: number;
  total_assets: number | null;
}

export interface RevenueByCharter {
  charter_type: string;
  total_service_charges: number;
  institution_count: number;
  avg_service_charges: number;
  quarter: string;
}

export async function getRevenueTrend(quarterCount = 8): Promise<RevenueTrend> {
  const sql = getSql();

  try {
    // institution_financials stores service_charge_income in thousands.
    // Multiply by 1000 in SQL to return real dollar amounts.
    const rows = await sql.unsafe(
      `SELECT
         TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter,
         MIN(inf.report_date)                                                 AS quarter_date,
         SUM(inf.service_charge_income * 1000)                               AS total_service_charges,
         COUNT(DISTINCT ct.cert_number)                                       AS total_institutions,
         SUM(CASE WHEN ct.charter_type = 'bank'
               THEN inf.service_charge_income * 1000 ELSE 0 END)             AS bank_service_charges,
         SUM(CASE WHEN ct.charter_type = 'credit_union'
               THEN inf.service_charge_income * 1000 ELSE 0 END)             AS cu_service_charges
       FROM institution_financials inf
       JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
       WHERE inf.service_charge_income > 0
       GROUP BY DATE_TRUNC('quarter', inf.report_date::date)
       ORDER BY DATE_TRUNC('quarter', inf.report_date::date) DESC
       LIMIT $1`,
      [quarterCount]
    ) as {
      quarter: string;
      quarter_date: string;
      total_service_charges: string;
      total_institutions: string;
      bank_service_charges: string;
      cu_service_charges: string;
    }[];

    const snapshots: RevenueSnapshot[] = rows.map((row) => ({
      quarter: row.quarter,
      total_service_charges: Number(row.total_service_charges),
      total_institutions: Number(row.total_institutions),
      bank_service_charges: Number(row.bank_service_charges),
      cu_service_charges: Number(row.cu_service_charges),
      yoy_change_pct: null,
    }));

    // Attach YoY change: compare index i to index i+4 (same quarter, prior year)
    for (let i = 0; i < snapshots.length; i++) {
      const priorYearIdx = i + 4;
      if (priorYearIdx < snapshots.length) {
        const current = snapshots[i].total_service_charges;
        const prior = snapshots[priorYearIdx].total_service_charges;
        snapshots[i].yoy_change_pct =
          prior > 0 ? ((current - prior) / prior) * 100 : null;
      }
    }

    return {
      quarters: snapshots,
      latest: snapshots[0] ?? null,
    };
  } catch (e) {
    console.warn('[getRevenueTrend]', e);
    return { quarters: [], latest: null };
  }
}

export async function getTopRevenueInstitutions(
  limit = 10
): Promise<TopRevenueInstitution[]> {
  const sql = getSql();

  try {
    // Find the latest report_date in institution_financials
    const [latestRow] = await sql`
      SELECT MAX(report_date) AS latest_date
      FROM institution_financials
      WHERE service_charge_income > 0
    `;

    if (!latestRow?.latest_date) return [];

    const latestDate = latestRow.latest_date instanceof Date
      ? latestRow.latest_date.toISOString().slice(0, 10)
      : String(latestRow.latest_date);

    // institution_financials stores monetary fields in thousands; multiply by 1000 for dollars.
    const rows = await sql.unsafe(
      `SELECT
         ct.cert_number,
         ct.institution_name,
         COALESCE(ct.charter_type, 'unknown')      AS charter_type,
         inf.report_date::text                      AS report_date,
         inf.service_charge_income * 1000           AS service_charge_income,
         inf.total_assets * 1000                    AS total_assets
       FROM institution_financials inf
       JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
       WHERE inf.report_date = $1
         AND inf.service_charge_income > 0
       ORDER BY inf.service_charge_income DESC
       LIMIT $2`,
      [latestDate, limit]
    ) as {
      cert_number: string;
      institution_name: string | null;
      charter_type: string;
      report_date: string;
      service_charge_income: string;
      total_assets: string | null;
    }[];

    return rows.map((row) => ({
      cert_number: row.cert_number,
      institution_name: row.institution_name,
      charter_type: row.charter_type,
      report_date: row.report_date,
      service_charge_income: Number(row.service_charge_income),
      total_assets: row.total_assets !== null ? Number(row.total_assets) : null,
    }));
  } catch {
    return [];
  }
}

export async function getRevenueByCharter(quarter?: string): Promise<RevenueByCharter[]> {
  const sql = getSql();

  try {
    const quarterFilter = quarter
      ? `AND TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') = $1`
      : `AND inf.report_date = (SELECT MAX(report_date) FROM institution_financials WHERE service_charge_income > 0)`;

    const rows = await sql.unsafe(
      `SELECT
         COALESCE(ct.charter_type, 'unknown')                AS charter_type,
         SUM(inf.service_charge_income * 1000)               AS total_service_charges,
         COUNT(DISTINCT ct.cert_number)                       AS institution_count,
         AVG(inf.service_charge_income * 1000)               AS avg_service_charges,
         TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter
       FROM institution_financials inf
       JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
       WHERE inf.service_charge_income > 0
         ${quarterFilter}
       GROUP BY ct.charter_type, DATE_TRUNC('quarter', inf.report_date::date)
       ORDER BY total_service_charges DESC`,
      quarter ? [quarter] : []
    ) as {
      charter_type: string;
      total_service_charges: string;
      institution_count: string;
      avg_service_charges: string;
      quarter: string;
    }[];

    return rows.map((row) => ({
      charter_type: row.charter_type,
      total_service_charges: Number(row.total_service_charges),
      institution_count: Number(row.institution_count),
      avg_service_charges: Number(row.avg_service_charges),
      quarter: row.quarter,
    }));
  } catch (e) {
    console.warn('[getRevenueByCharter]', e);
    return [];
  }
}

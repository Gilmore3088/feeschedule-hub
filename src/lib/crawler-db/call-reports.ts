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

export async function getRevenueTrend(quarterCount = 8): Promise<RevenueTrend> {
  const sql = getSql();

  try {
  // institution_financials has crawl_target_id, not cert_number/charter_type directly.
  // JOIN to crawl_targets for charter_type and cert_number.
  // report_date is TEXT (e.g. '2024-12-31') — cast to date for DATE_TRUNC.
  const rows = await sql.unsafe(
    `SELECT
       TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter,
       MIN(inf.report_date)                                     AS quarter_date,
       SUM(inf.service_charge_income)                           AS total_service_charges,
       COUNT(DISTINCT ct.cert_number)                           AS total_institutions,
       SUM(CASE WHEN ct.charter_type = 'bank' THEN inf.service_charge_income ELSE 0 END)
                                                                 AS bank_service_charges,
       SUM(CASE WHEN ct.charter_type = 'credit_union' THEN inf.service_charge_income ELSE 0 END)
                                                                 AS cu_service_charges
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

  const snapshots: RevenueSnapshot[] = rows.map((row, idx) => ({
    quarter: row.quarter,
    total_service_charges: Number(row.total_service_charges),
    total_institutions: Number(row.total_institutions),
    bank_service_charges: Number(row.bank_service_charges),
    cu_service_charges: Number(row.cu_service_charges),
    // YoY = compare to 4 quarters back (idx + 4); null if not available
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
  } catch {
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

    const rows = await sql.unsafe(
      `SELECT
         ct.cert_number,
         ct.institution_name,
         COALESCE(ct.charter_type, 'unknown') AS charter_type,
         inf.report_date::text                                   AS report_date,
         inf.service_charge_income,
         inf.total_assets
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

export interface DistrictFeeRevenue {
  fed_district: number;
  institution_count: number;
  total_sc_income: number;
  avg_sc_income: number;
  total_other_noninterest: number;
}

export async function getDistrictFeeRevenue(
  district: number,
  reportDate?: string
): Promise<DistrictFeeRevenue | null> {
  const sql = getSql();

  // Find latest report date if not specified
  let date = reportDate;
  if (!date) {
    const [row] = await sql`
      SELECT MAX(report_date)::text AS latest_date
      FROM institution_financials
      WHERE service_charge_income > 0
    `;
    if (!row?.latest_date) return null;
    date = row.latest_date;
  }

  const rows = await sql.unsafe(
    `SELECT
       ct.fed_district,
       COUNT(DISTINCT inf.crawl_target_id)::int  AS institution_count,
       COALESCE(SUM(inf.service_charge_income), 0)::bigint AS total_sc_income,
       COALESCE(AVG(inf.service_charge_income), 0)::bigint AS avg_sc_income,
       COALESCE(SUM(inf.other_noninterest_income), 0)::bigint AS total_other_noninterest
     FROM institution_financials inf
     JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
     WHERE inf.report_date = $1
       AND ct.fed_district = $2
       AND inf.service_charge_income > 0
     GROUP BY ct.fed_district`,
    [date, district]
  ) as {
    fed_district: string;
    institution_count: string;
    total_sc_income: string;
    avg_sc_income: string;
    total_other_noninterest: string;
  }[];

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    fed_district: Number(r.fed_district),
    institution_count: Number(r.institution_count),
    total_sc_income: Number(r.total_sc_income),
    avg_sc_income: Number(r.avg_sc_income),
    total_other_noninterest: Number(r.total_other_noninterest),
  };
}
export interface DistrictFeeRevenue {
  fed_district: number;
  institution_count: number;
  total_sc_income: number;
  avg_sc_income: number;
  total_other_noninterest: number;
}

export async function getDistrictFeeRevenue(
  district: number,
  reportDate?: string
): Promise<DistrictFeeRevenue | null> {
  const sql = getSql();

  // Find latest report date if not specified
  let date = reportDate;
  if (!date) {
    const [row] = await sql`
      SELECT MAX(report_date)::text AS latest_date
      FROM institution_financials
      WHERE service_charge_income > 0
    `;
    if (!row?.latest_date) return null;
    date = row.latest_date;
  }

  const rows = await sql.unsafe(
    `SELECT
       ct.fed_district,
       COUNT(DISTINCT inf.crawl_target_id)::int  AS institution_count,
       COALESCE(SUM(inf.service_charge_income), 0)::bigint AS total_sc_income,
       COALESCE(AVG(inf.service_charge_income), 0)::bigint AS avg_sc_income,
       COALESCE(SUM(inf.other_noninterest_income), 0)::bigint AS total_other_noninterest
     FROM institution_financials inf
     JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
     WHERE inf.report_date = $1
       AND ct.fed_district = $2
       AND inf.service_charge_income > 0
     GROUP BY ct.fed_district`,
    [date, district]
  ) as {
    fed_district: string;
    institution_count: string;
    total_sc_income: string;
    avg_sc_income: string;
    total_other_noninterest: string;
  }[];

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    fed_district: Number(r.fed_district),
    institution_count: Number(r.institution_count),
    total_sc_income: Number(r.total_sc_income),
    avg_sc_income: Number(r.avg_sc_income),
    total_other_noninterest: Number(r.total_other_noninterest),
  };
}

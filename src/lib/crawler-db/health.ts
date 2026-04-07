import { getSql } from "./connection";
import { type RichIndicator, deriveTrend } from "./fed";
import { priorYearQuarter } from "./call-reports";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface IndustryHealthMetrics {
  roa: RichIndicator | null;
  roe: RichIndicator | null;
  efficiency_ratio: RichIndicator | null;
}

export interface GrowthTrend {
  current_yoy_pct: number | null;
  history: { quarter: string; yoy_pct: number | null; absolute: number }[];
  trend: 'rising' | 'falling' | 'stable';
  asOf: string;
}

export interface InstitutionCountSnapshot {
  quarter: string;
  total: number;
  bank_count: number;
  cu_count: number;
  change: number | null;
}

export interface HealthByCharter {
  bank: IndustryHealthMetrics;
  credit_union: IndustryHealthMetrics;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_METRIC_FIELDS = new Set<string>(['roa', 'roe', 'efficiency_ratio']);

// ── Private helpers ───────────────────────────────────────────────────────────

async function fetchIndustryMetric(
  field: 'roa' | 'roe' | 'efficiency_ratio',
  quarterCount = 8
): Promise<RichIndicator | null> {
  if (!ALLOWED_METRIC_FIELDS.has(field)) {
    throw new Error(`Invalid metric field: ${field}`);
  }
  const sql = getSql();

  const rows = await sql.unsafe(
    `SELECT TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
            AVG(${field}) AS value
     FROM institution_financials
     WHERE ${field} IS NOT NULL
     GROUP BY DATE_TRUNC('quarter', report_date::date)
     ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
     LIMIT $1`,
    [quarterCount]
  ) as { quarter: string; value: string | number }[];

  if (!rows.length) return null;

  const current = Number(rows[0].value);
  const asOf = rows[0].quarter;
  const history = rows
    .slice(1)
    .reverse()
    .map((r) => ({ date: r.quarter, value: Number(r.value) }));
  const trend = deriveTrend(current, history);

  return { current, history, trend, asOf };
}

async function fetchCharterMetric(
  field: 'roa' | 'roe' | 'efficiency_ratio',
  charterType: 'bank' | 'credit_union',
  quarterCount = 8
): Promise<RichIndicator | null> {
  if (!ALLOWED_METRIC_FIELDS.has(field)) {
    throw new Error(`Invalid metric field: ${field}`);
  }
  const sql = getSql();

  const rows = await sql.unsafe(
    `SELECT TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter,
            AVG(inf.${field}) AS value
     FROM institution_financials inf
     JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
     WHERE ct.charter_type = $2
       AND inf.${field} IS NOT NULL
     GROUP BY DATE_TRUNC('quarter', inf.report_date::date)
     ORDER BY DATE_TRUNC('quarter', inf.report_date::date) DESC
     LIMIT $1`,
    [quarterCount, charterType]
  ) as { quarter: string; value: string | number }[];

  if (!rows.length) return null;

  const current = Number(rows[0].value);
  const asOf = rows[0].quarter;
  const history = rows
    .slice(1)
    .reverse()
    .map((r) => ({ date: r.quarter, value: Number(r.value) }));
  const trend = deriveTrend(current, history);

  return { current, history, trend, asOf };
}

// ── Exported functions ────────────────────────────────────────────────────────

export async function getIndustryHealthMetrics(): Promise<IndustryHealthMetrics> {
  const empty: IndustryHealthMetrics = { roa: null, roe: null, efficiency_ratio: null };

  try {
    const [roa, roe, efficiency_ratio] = await Promise.all([
      fetchIndustryMetric('roa'),
      fetchIndustryMetric('roe'),
      fetchIndustryMetric('efficiency_ratio'),
    ]);
    return { roa, roe, efficiency_ratio };
  } catch (err) {
    console.error('[health] getIndustryHealthMetrics failed:', err);
    return empty;
  }
}

export async function getDepositGrowthTrend(quarterCount = 8): Promise<GrowthTrend | null> {
  const sql = getSql();

  try {
    const rows = await sql.unsafe(
      `SELECT TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
              SUM(total_deposits * 1000) AS total
       FROM institution_financials
       WHERE total_deposits IS NOT NULL
       GROUP BY DATE_TRUNC('quarter', report_date::date)
       ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
       LIMIT $1`,
      [quarterCount]
    ) as { quarter: string; total: string | number }[];

    if (!rows.length) return null;

    const byQuarter = new Map<string, number>();
    for (const row of rows) {
      byQuarter.set(row.quarter, Number(row.total));
    }

    // Compute YoY for each quarter via label matching
    const historyRows: { quarter: string; yoy_pct: number | null; absolute: number }[] = rows
      .slice()
      .reverse()
      .map((row) => {
        const absolute = Number(row.total);
        const priorLabel = priorYearQuarter(row.quarter);
        const prior = byQuarter.get(priorLabel);
        const yoy_pct = prior !== undefined && prior > 0
          ? ((absolute - prior) / prior) * 100
          : null;
        return { quarter: row.quarter, yoy_pct, absolute };
      });

    // current = most recent quarter (last in historyRows since we reversed)
    const latest = historyRows[historyRows.length - 1];
    const current_yoy_pct = latest.yoy_pct;
    const asOf = latest.quarter;

    // Compute trend from history of yoy_pct values
    const trendHistory = historyRows
      .slice(0, -1)
      .map((r) => ({ value: r.yoy_pct ?? 0 }));
    const trend = deriveTrend(current_yoy_pct ?? 0, trendHistory);

    return {
      current_yoy_pct,
      history: historyRows.slice(0, -1),
      trend,
      asOf,
    };
  } catch (err) {
    console.error('[health] getDepositGrowthTrend failed:', err);
    return null;
  }
}

export async function getLoanGrowthTrend(quarterCount = 8): Promise<GrowthTrend | null> {
  const sql = getSql();

  try {
    const rows = await sql.unsafe(
      `SELECT TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
              SUM(total_loans * 1000) AS total
       FROM institution_financials
       WHERE total_loans IS NOT NULL
       GROUP BY DATE_TRUNC('quarter', report_date::date)
       ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
       LIMIT $1`,
      [quarterCount]
    ) as { quarter: string; total: string | number }[];

    if (!rows.length) return null;

    const byQuarter = new Map<string, number>();
    for (const row of rows) {
      byQuarter.set(row.quarter, Number(row.total));
    }

    const historyRows: { quarter: string; yoy_pct: number | null; absolute: number }[] = rows
      .slice()
      .reverse()
      .map((row) => {
        const absolute = Number(row.total);
        const priorLabel = priorYearQuarter(row.quarter);
        const prior = byQuarter.get(priorLabel);
        const yoy_pct = prior !== undefined && prior > 0
          ? ((absolute - prior) / prior) * 100
          : null;
        return { quarter: row.quarter, yoy_pct, absolute };
      });

    const latest = historyRows[historyRows.length - 1];
    const current_yoy_pct = latest.yoy_pct;
    const asOf = latest.quarter;

    const trendHistory = historyRows
      .slice(0, -1)
      .map((r) => ({ value: r.yoy_pct ?? 0 }));
    const trend = deriveTrend(current_yoy_pct ?? 0, trendHistory);

    return {
      current_yoy_pct,
      history: historyRows.slice(0, -1),
      trend,
      asOf,
    };
  } catch (err) {
    console.error('[health] getLoanGrowthTrend failed:', err);
    return null;
  }
}

export async function getInstitutionCountTrend(
  quarterCount = 8
): Promise<InstitutionCountSnapshot[]> {
  const sql = getSql();

  try {
    const rows = await sql.unsafe(
      `SELECT TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter,
              COUNT(DISTINCT inf.crawl_target_id) AS total,
              SUM(CASE WHEN ct.charter_type = 'bank' THEN 1 ELSE 0 END) AS bank_count,
              SUM(CASE WHEN ct.charter_type = 'credit_union' THEN 1 ELSE 0 END) AS cu_count
       FROM institution_financials inf
       JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
       GROUP BY DATE_TRUNC('quarter', inf.report_date::date)
       ORDER BY DATE_TRUNC('quarter', inf.report_date::date) DESC
       LIMIT $1`,
      [quarterCount]
    ) as { quarter: string; total: string; bank_count: string; cu_count: string }[];

    const snapshots: InstitutionCountSnapshot[] = rows.map((row, idx) => ({
      quarter: row.quarter,
      total: Number(row.total),
      bank_count: Number(row.bank_count),
      cu_count: Number(row.cu_count),
      // period-over-period diff vs next entry (which is one quarter earlier)
      change: idx + 1 < rows.length
        ? Number(row.total) - Number(rows[idx + 1].total)
        : null,
    }));

    return snapshots;
  } catch (err) {
    console.error('[health] getInstitutionCountTrend failed:', err);
    return [];
  }
}

export async function getHealthMetricsByCharter(): Promise<HealthByCharter> {
  const emptyMetrics: IndustryHealthMetrics = { roa: null, roe: null, efficiency_ratio: null };
  const empty: HealthByCharter = { bank: emptyMetrics, credit_union: emptyMetrics };

  try {
    const [bankRoa, bankRoe, bankEff, cuRoa, cuRoe, cuEff] = await Promise.all([
      fetchCharterMetric('roa', 'bank'),
      fetchCharterMetric('roe', 'bank'),
      fetchCharterMetric('efficiency_ratio', 'bank'),
      fetchCharterMetric('roa', 'credit_union'),
      fetchCharterMetric('roe', 'credit_union'),
      fetchCharterMetric('efficiency_ratio', 'credit_union'),
    ]);

    return {
      bank: { roa: bankRoa, roe: bankRoe, efficiency_ratio: bankEff },
      credit_union: { roa: cuRoa, roe: cuRoe, efficiency_ratio: cuEff },
    };
  } catch (err) {
    console.error('[health] getHealthMetricsByCharter failed:', err);
    return empty;
  }
}

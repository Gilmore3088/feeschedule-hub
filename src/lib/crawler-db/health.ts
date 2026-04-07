import { getSql } from "./connection";

export interface RichIndicator {
  current: number;
  history: { date: string; value: number }[];
  trend: "rising" | "falling" | "stable";
  asOf: string;
}

export interface IndustryHealthMetrics {
  roa: RichIndicator | null;
  roe: RichIndicator | null;
  efficiency_ratio: RichIndicator | null;
}

function computeTrend(history: { date: string; value: number }[]): "rising" | "falling" | "stable" {
  if (history.length < 2) return "stable";
  const latest = history[0].value;
  const previous = history[1].value;
  const diff = latest - previous;
  if (Math.abs(diff) < 0.0001) return "stable";
  return diff > 0 ? "rising" : "falling";
}

async function getMetricHistory(
  metricName: "roa" | "roe" | "efficiency_ratio",
  limit = 8
): Promise<RichIndicator | null> {
  const sql = getSql();

  try {
    const rows = await sql.unsafe(
      `SELECT
         TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
         MAX(report_date)                                                 AS report_date,
         AVG(${metricName})                                               AS avg_value
       FROM institution_financials
       WHERE ${metricName} IS NOT NULL
         AND ${metricName} BETWEEN -10 AND 10
       GROUP BY DATE_TRUNC('quarter', report_date::date)
       ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
       LIMIT $1`,
      [limit]
    ) as { quarter: string; report_date: string; avg_value: string }[];

    if (rows.length === 0) return null;

    const history = rows.map((r) => ({
      date: r.quarter,
      value: Number(r.avg_value),
    }));

    const latest = history[0];
    const rawDate = rows[0].report_date;
    const asOf = (rawDate as unknown) instanceof Date
      ? (rawDate as unknown as Date).toISOString().slice(0, 10)
      : String(rawDate);

    return {
      current: latest.value,
      history,
      trend: computeTrend(history),
      asOf,
    };
  } catch {
    return null;
  }
}

export async function getIndustryHealthMetrics(): Promise<IndustryHealthMetrics> {
  const [roa, roe, efficiency_ratio] = await Promise.all([
    getMetricHistory("roa"),
    getMetricHistory("roe"),
    getMetricHistory("efficiency_ratio"),
  ]);

  return { roa, roe, efficiency_ratio };
}

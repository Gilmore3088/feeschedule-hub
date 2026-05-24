/**
 * Coverage queries — per-state institution × fee-URL × verified-fee
 * progress. BDA-2's Q-02 from docs/team/05-product-focus.md:
 * operators need to see WHERE THE HOLES ARE per state, not just
 * the aggregate counts.
 *
 * Each row answers three questions for one state:
 *  1. How many institutions are seeded?
 *  2. How many have a fee_schedule_url (Magellan / discoverer found one)?
 *  3. How many have at least one fees_published row in the last 60 days?
 */

import { sql } from "./connection";

export interface CoverageByStateRow {
  state_code: string;
  total_institutions: number;
  with_fee_url: number;
  with_recent_publish: number;
  url_pct: number;          // 0..100
  publish_pct: number;      // 0..100
}

export interface CoverageSummary {
  total_states: number;
  states_with_full_coverage: number;   // both pcts >= 90
  states_with_url_gap: number;          // url_pct < 50
  states_with_publish_gap: number;      // publish_pct < 50 but url_pct >= 50
  median_url_pct: number;
  median_publish_pct: number;
}

const FRESH_DAYS = 60;

export async function getCoverageByState(): Promise<CoverageByStateRow[]> {
  const rows = await sql<{
    state_code: string;
    total_institutions: number;
    with_fee_url: number;
    with_recent_publish: number;
  }[]>`
    SELECT
      ct.state_code,
      COUNT(*)::int AS total_institutions,
      COUNT(*) FILTER (
        WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url <> ''
      )::int AS with_fee_url,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM fees_published fp
           WHERE fp.institution_id = ct.id
             AND fp.rolled_back_at IS NULL
             AND fp.published_at > NOW() - INTERVAL '${sql.unsafe(String(FRESH_DAYS))} days'
        )
      )::int AS with_recent_publish
    FROM crawl_targets ct
    WHERE ct.state_code IS NOT NULL AND ct.state_code <> ''
    GROUP BY ct.state_code
    ORDER BY ct.state_code
  `;

  return rows.map((r) => ({
    state_code: r.state_code,
    total_institutions: r.total_institutions,
    with_fee_url: r.with_fee_url,
    with_recent_publish: r.with_recent_publish,
    url_pct:
      r.total_institutions > 0
        ? Math.round((r.with_fee_url / r.total_institutions) * 1000) / 10
        : 0,
    publish_pct:
      r.total_institutions > 0
        ? Math.round((r.with_recent_publish / r.total_institutions) * 1000) / 10
        : 0,
  }));
}

export async function getCoverageSummary(): Promise<CoverageSummary> {
  const rows = await getCoverageByState();
  if (rows.length === 0) {
    return {
      total_states: 0,
      states_with_full_coverage: 0,
      states_with_url_gap: 0,
      states_with_publish_gap: 0,
      median_url_pct: 0,
      median_publish_pct: 0,
    };
  }

  const fullCoverage = rows.filter((r) => r.url_pct >= 90 && r.publish_pct >= 90).length;
  const urlGap = rows.filter((r) => r.url_pct < 50).length;
  const publishGap = rows.filter((r) => r.publish_pct < 50 && r.url_pct >= 50).length;

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    total_states: rows.length,
    states_with_full_coverage: fullCoverage,
    states_with_url_gap: urlGap,
    states_with_publish_gap: publishGap,
    median_url_pct: median(rows.map((r) => r.url_pct)),
    median_publish_pct: median(rows.map((r) => r.publish_pct)),
  };
}

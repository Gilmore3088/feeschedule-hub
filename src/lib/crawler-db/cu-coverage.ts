/**
 * Credit union coverage audit (Q-07).
 *
 * P-04 in the customer survey reported missing California state-
 * chartered CUs. This module surfaces the per-state breakdown of
 * credit-union vs. bank coverage so operators can spot where the
 * fleet is bank-heavy and CUs need a targeted seed run.
 *
 * Today's query reads only crawl_targets (charter_type column) and
 * fees_published (rolled_back_at filter, per Q-05 contract). The
 * full "compare against NCUA universe" check requires an operator-
 * supplied NCUA institution CSV — once that exists, see
 * `compareCuCoverageAgainstNcua()` (stub below).
 */

import { sql } from "./connection";

export interface CuCoverageRow {
  state_code: string;
  total_cus: number;
  cus_with_url: number;
  cus_with_recent_publish: number;
  url_pct: number;
  publish_pct: number;
  bank_publish_pct: number;  // for comparison — are CUs under-served vs. banks in this state?
  cu_vs_bank_gap_pp: number; // bank% - cu% (positive = CUs trailing banks)
}

const FRESH_DAYS = 60;

export async function getCuCoverageByState(): Promise<CuCoverageRow[]> {
  const rows = await sql<{
    state_code: string;
    total_cus: number;
    cus_with_url: number;
    cus_with_recent_publish: number;
    total_banks: number;
    banks_with_recent_publish: number;
  }[]>`
    SELECT
      ct.state_code,
      COUNT(*) FILTER (WHERE ct.charter_type ILIKE 'credit%')::int AS total_cus,
      COUNT(*) FILTER (
        WHERE ct.charter_type ILIKE 'credit%'
          AND ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url <> ''
      )::int AS cus_with_url,
      COUNT(*) FILTER (
        WHERE ct.charter_type ILIKE 'credit%'
          AND EXISTS (
            SELECT 1 FROM fees_published fp
             WHERE fp.institution_id = ct.id
               AND fp.rolled_back_at IS NULL
               AND fp.published_at > NOW() - INTERVAL '${sql.unsafe(String(FRESH_DAYS))} days'
          )
      )::int AS cus_with_recent_publish,
      COUNT(*) FILTER (WHERE ct.charter_type ILIKE 'bank%')::int AS total_banks,
      COUNT(*) FILTER (
        WHERE ct.charter_type ILIKE 'bank%'
          AND EXISTS (
            SELECT 1 FROM fees_published fp
             WHERE fp.institution_id = ct.id
               AND fp.rolled_back_at IS NULL
               AND fp.published_at > NOW() - INTERVAL '${sql.unsafe(String(FRESH_DAYS))} days'
          )
      )::int AS banks_with_recent_publish
    FROM crawl_targets ct
    WHERE ct.state_code IS NOT NULL AND ct.state_code <> ''
    GROUP BY ct.state_code
    ORDER BY ct.state_code
  `;

  return rows
    .filter((r) => r.total_cus > 0)
    .map((r) => {
      const cu_publish_pct =
        r.total_cus > 0
          ? Math.round((r.cus_with_recent_publish / r.total_cus) * 1000) / 10
          : 0;
      const bank_publish_pct =
        r.total_banks > 0
          ? Math.round((r.banks_with_recent_publish / r.total_banks) * 1000) / 10
          : 0;
      return {
        state_code: r.state_code,
        total_cus: r.total_cus,
        cus_with_url: r.cus_with_url,
        cus_with_recent_publish: r.cus_with_recent_publish,
        url_pct:
          r.total_cus > 0
            ? Math.round((r.cus_with_url / r.total_cus) * 1000) / 10
            : 0,
        publish_pct: cu_publish_pct,
        bank_publish_pct,
        cu_vs_bank_gap_pp:
          Math.round((bank_publish_pct - cu_publish_pct) * 10) / 10,
      };
    });
}

/**
 * Operator follow-up: compare our CU coverage to the NCUA's published
 * institution list. Stub until the NCUA CSV is loaded into a staging
 * table (`ncua_institution_universe`). When that exists, replace this
 * with the actual join.
 */
export async function compareCuCoverageAgainstNcua(): Promise<{
  ncua_total: number | null;
  our_total: number;
  missing_count: number | null;
  missing_sample: { cert_number: string; institution_name: string; state_code: string }[];
  note: string;
}> {
  // Check whether the universe table exists; if not, return a stub so
  // the admin UI can surface a clear "operator action required" panel.
  const [exists] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'ncua_institution_universe'
    ) AS exists
  `;

  const [ourTotal] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
      FROM crawl_targets
     WHERE charter_type ILIKE 'credit%'
  `;

  if (!exists.exists) {
    return {
      ncua_total: null,
      our_total: ourTotal?.cnt ?? 0,
      missing_count: null,
      missing_sample: [],
      note:
        "ncua_institution_universe table not loaded yet. Operator: download " +
        "the NCUA credit-union list (https://www.ncua.gov/analysis/credit-union-corporate-call-report-data) " +
        "and import as `ncua_institution_universe(cert_number TEXT, institution_name TEXT, " +
        "state_code TEXT)`. Re-run this query once loaded.",
    };
  }

  // Real path once the universe table exists.
  const [ncuaTotal] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt FROM ncua_institution_universe
  `;

  const missing = await sql<{
    cert_number: string;
    institution_name: string;
    state_code: string;
  }[]>`
    SELECT u.cert_number, u.institution_name, u.state_code
      FROM ncua_institution_universe u
      LEFT JOIN crawl_targets ct
             ON ct.cert_number = u.cert_number
            AND ct.source IN ('ncua', 'NCUA')
     WHERE ct.id IS NULL
     ORDER BY u.state_code, u.institution_name
     LIMIT 20
  `;

  const [missingTotal] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
      FROM ncua_institution_universe u
      LEFT JOIN crawl_targets ct
             ON ct.cert_number = u.cert_number
            AND ct.source IN ('ncua', 'NCUA')
     WHERE ct.id IS NULL
  `;

  return {
    ncua_total: ncuaTotal.cnt,
    our_total: ourTotal.cnt,
    missing_count: missingTotal.cnt,
    missing_sample: missing,
    note: "",
  };
}

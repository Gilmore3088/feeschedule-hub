/**
 * Golden-set status for the console — pass/fail per pinned institution, the
 * accuracy gate that blocks Atlas from publishing a regression.
 */

import { sql } from "@/lib/crawler-db/connection";

export interface GoldenStatus {
  total: number;
  regressions: number;
  clean: boolean;
}

export async function getGoldenStatus(): Promise<GoldenStatus> {
  try {
    // A golden institution "regresses" if any expected fee is missing or an
    // amount is off beyond tolerance vs the latest verified value.
    const rows = await sql<
      { crawl_target_id: string; expected: string; matched: string }[]
    >`
      WITH latest AS (
        SELECT DISTINCT ON (institution_id, canonical_fee_key)
               institution_id, canonical_fee_key, amount
          FROM fees_verified ORDER BY institution_id, canonical_fee_key, created_at DESC
      )
      SELECT g.crawl_target_id,
             count(*)                                                          AS expected,
             count(*) FILTER (
               WHERE l.canonical_fee_key IS NOT NULL
                 AND (g.expected_amount IS NULL OR l.amount IS NULL
                      OR abs(l.amount - g.expected_amount) <= g.tolerance))    AS matched
        FROM golden_fees g
        LEFT JOIN latest l ON l.institution_id = g.crawl_target_id
                          AND l.canonical_fee_key = g.canonical_fee_key
       GROUP BY g.crawl_target_id
    `;
    const total = rows.length;
    const regressions = rows.filter((r) => Number(r.matched) < Number(r.expected)).length;
    return { total, regressions, clean: regressions === 0 };
  } catch {
    return { total: 0, regressions: 0, clean: true };
  }
}

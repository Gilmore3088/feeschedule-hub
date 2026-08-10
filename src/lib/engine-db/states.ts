/**
 * Steward board — per-state coverage + latest cycle notes.
 *
 * Coverage from crawl_targets ⋈ fees_verified; cycle stats from state_run_notes;
 * learned facts count from institution_hints. This is the compounding surface —
 * discovered/extracted/failed trend per state.
 */

import { sql } from "@/lib/crawler-db/connection";

export interface StewardCell {
  stateCode: string;
  institutions: number;
  withFees: number;
  coveragePct: number;
  lastCycle: number | null;
  lastExtracted: number;
  lastFailed: number;
  hintsLearned: number;
}

export async function getStewardGrid(): Promise<StewardCell[]> {
  try {
    const rows = await sql<
      {
        state_code: string;
        institutions: string;
        with_fees: string;
        last_cycle: string | null;
        last_extracted: string | null;
        last_failed: string | null;
        hints: string;
      }[]
    >`
      WITH cov AS (
        SELECT t.state_code,
               count(DISTINCT t.id)                                            AS institutions,
               count(DISTINCT v.institution_id)                                AS with_fees
          FROM crawl_targets t
          LEFT JOIN fees_verified v ON v.institution_id = t.id
         WHERE t.status='active' AND t.state_code IS NOT NULL
         GROUP BY t.state_code
      ),
      latest AS (
        SELECT DISTINCT ON (state_code) state_code, run_id AS cycle, extracted, failed
          FROM state_run_notes ORDER BY state_code, run_id DESC
      ),
      hints AS (
        SELECT state_code, count(*) AS n FROM institution_hints GROUP BY state_code
      )
      SELECT c.state_code, c.institutions, c.with_fees,
             l.cycle AS last_cycle, l.extracted AS last_extracted, l.failed AS last_failed,
             COALESCE(h.n, 0) AS hints
        FROM cov c
        LEFT JOIN latest l ON l.state_code = c.state_code
        LEFT JOIN hints  h ON h.state_code = c.state_code
       ORDER BY c.state_code
    `;
    return rows.map((r) => {
      const inst = Number(r.institutions);
      const withFees = Number(r.with_fees);
      return {
        stateCode: r.state_code,
        institutions: inst,
        withFees,
        coveragePct: inst ? Math.round((withFees / inst) * 1000) / 10 : 0,
        lastCycle: r.last_cycle == null ? null : Number(r.last_cycle),
        lastExtracted: Number(r.last_extracted ?? 0),
        lastFailed: Number(r.last_failed ?? 0),
        hintsLearned: Number(r.hints),
      };
    });
  } catch {
    return [];
  }
}

/** Per-state institution list for the drill-down. */
export interface StewardInstitution {
  id: number;
  name: string;
  charter: string | null;
  feeCount: number;
  renderMode: string | null;
  knownUrl: string | null;
  failStreak: number;
}

export async function getStateInstitutions(stateCode: string): Promise<StewardInstitution[]> {
  try {
    const rows = await sql<
      {
        id: string;
        institution_name: string;
        charter_type: string | null;
        fee_count: string;
        render_mode: string | null;
        known_fee_url: string | null;
        consecutive_failures: string;
      }[]
    >`
      SELECT t.id, t.institution_name, t.charter_type,
             count(v.fee_verified_id)      AS fee_count,
             h.render_mode, h.known_fee_url,
             t.consecutive_failures
        FROM crawl_targets t
        LEFT JOIN fees_verified v     ON v.institution_id = t.id
        LEFT JOIN institution_hints h ON h.crawl_target_id = t.id
       WHERE t.state_code = ${stateCode} AND t.status='active'
       GROUP BY t.id, t.institution_name, t.charter_type, h.render_mode,
                h.known_fee_url, t.consecutive_failures
       ORDER BY fee_count DESC, t.institution_name
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.institution_name,
      charter: r.charter_type,
      feeCount: Number(r.fee_count),
      renderMode: r.render_mode,
      knownUrl: r.known_fee_url,
      failStreak: Number(r.consecutive_failures),
    }));
  } catch {
    return [];
  }
}

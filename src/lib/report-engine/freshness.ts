/**
 * Report Engine — Data Freshness Gate
 * Phase 13-01: D-10 implementation
 *
 * Checks whether crawl_targets data is fresh enough to generate a report.
 * Uses PERCENTILE_CONT(0.5) (standard Postgres median — MEDIAN is not a
 * built-in aggregate in Postgres/Supabase).
 *
 * Fail-safe: null result from DB (no crawl_targets with timestamps) is
 * treated as age=999 days — always stale. Never publish empty-data reports.
 */

import { getSql } from '@/lib/crawler-db/connection';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FreshnessResult {
  fresh: boolean;
  medianAgeDays: number;
  threshold: number;
  /** Present only when fresh is false. */
  reason?: string;
}

// ─── Thresholds (D-10) ────────────────────────────────────────────────────

const NATIONAL_THRESHOLD_DAYS = 120;
const STATE_THRESHOLD_DAYS = 90;

// Fail-safe sentinel: treat missing data as very stale.
const MISSING_DATA_AGE_DAYS = 999;

// ─── Implementation ───────────────────────────────────────────────────────

/**
 * Check whether the crawl data backing a report is fresh enough.
 *
 * @param scope   'national' | 'state' | 'peer'
 * @param stateCode  Required when scope is 'state' (e.g. 'WY', 'MT').
 */
export async function checkFreshness(
  scope: 'national' | 'state' | 'peer',
  stateCode?: string,
): Promise<FreshnessResult> {
  const sql = getSql();

  const threshold =
    scope === 'state' ? STATE_THRESHOLD_DAYS : NATIONAL_THRESHOLD_DAYS;

  let rows: Array<{ median_age: string | null }>;

  if (scope === 'state' && stateCode) {
    rows = await sql<Array<{ median_age: string | null }>>`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (NOW() - last_crawl_at::timestamptz)) / 86400.0
      ) AS median_age
      FROM crawl_targets
      WHERE last_crawl_at IS NOT NULL
        AND state_code = ${stateCode}
    `;
  } else {
    rows = await sql<Array<{ median_age: string | null }>>`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (NOW() - last_crawl_at::timestamptz)) / 86400.0
      ) AS median_age
      FROM crawl_targets
      WHERE last_crawl_at IS NOT NULL
    `;
  }

  const rawAge = rows[0]?.median_age;
  const medianAgeDays =
    rawAge === null || rawAge === undefined
      ? MISSING_DATA_AGE_DAYS
      : parseFloat(rawAge);

  if (medianAgeDays > threshold) {
    const scopeLabel =
      scope === 'state' && stateCode
        ? `State (${stateCode})`
        : scope === 'peer'
          ? 'Peer'
          : 'National';

    return {
      fresh: false,
      medianAgeDays,
      threshold,
      reason: `${scopeLabel} data is stale: median crawl age is ${Math.round(medianAgeDays)} days (threshold: ${threshold} days)`,
    };
  }

  return { fresh: true, medianAgeDays, threshold };
}

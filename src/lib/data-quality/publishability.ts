/**
 * Publishability — the line that decides when pipeline work stops.
 *
 * "The data isn't good enough yet" is available as a reason forever unless the
 * bar is written down as a number. This module is that number, measured the
 * same way every time, so the answer is a reading rather than an argument.
 *
 * Ported from Reports/studio/coverage.sql, the ad-hoc version of this question
 * used to pick the original 25 report institutions.
 *
 * WHAT IT MEASURED ON 2026-08-24 (first run against production):
 *   8,750 institutions on file
 *     508 publish any featured fee at all
 *      30 publish >= 9 of 15   (matches the studio's own viable set)
 *       9 publish >= 12 of 15
 *
 * That is the whole business constraint in four numbers. The report engine can
 * only serve the institutions it has data for, so coverage work is not optional
 * housekeeping — it is what creates addressable customers. The threshold below
 * is a count for that reason: you sell a report to an institution, not to a
 * percentage.
 */
import { getSql } from "@/lib/data-store/connection";

/** The categories a Competitive Fee Position report is built from. */
export const FEATURED_CATEGORIES = [
  "monthly_maintenance",
  "overdraft",
  "nsf",
  "atm_non_network",
  "card_foreign_txn",
  "wire_domestic_outgoing",
  "stop_payment",
  "wire_intl_outgoing",
  "wire_domestic_incoming",
  "cashiers_check",
  "od_protection_transfer",
  "paper_statement",
  "minimum_balance",
  "card_replacement",
  "deposited_item_return",
] as const;

/** A report with no visible holes. */
export const FULL_REPORT_CATEGORIES = 12;

/** A report that stands up with its gaps stated. The studio's own bar. */
export const VIABLE_REPORT_CATEGORIES = 9;

/**
 * The stop rule, as a count of addressable institutions rather than a share.
 *
 * Below this, coverage work is the constraint on revenue and outranks other
 * inward work. At or above it, pipeline work ranks below anything outward —
 * there are enough institutions to sell to, and polishing the pipeline further
 * stops being the thing standing between the product and a customer.
 */
export const REPORT_READY_TARGET = 50;

export interface StateCoverage {
  stateCode: string;
  institutions: number;
  /** Institutions publishing >= FULL_REPORT_CATEGORIES featured categories. */
  fullReportReady: number;
  /** Institutions publishing >= VIABLE_REPORT_CATEGORIES. */
  viableReportReady: number;
}

export interface PublishabilitySnapshot {
  target: number;
  fullReportCategories: number;
  viableReportCategories: number;
  /** Total institutions on file with a state. */
  institutions: number;
  /** Institutions publishing at least one featured category. */
  withAnyFeaturedFee: number;
  fullReportReady: number;
  viableReportReady: number;
  /** True once viableReportReady clears the target. */
  aboveLine: boolean;
  /** States with at least one report-ready institution, best first. */
  states: StateCoverage[];
  error: string | null;
}

export async function getPublishabilitySnapshot(): Promise<PublishabilitySnapshot> {
  const base: PublishabilitySnapshot = {
    target: REPORT_READY_TARGET,
    fullReportCategories: FULL_REPORT_CATEGORIES,
    viableReportCategories: VIABLE_REPORT_CATEGORIES,
    institutions: 0,
    withAnyFeaturedFee: 0,
    fullReportReady: 0,
    viableReportReady: 0,
    aboveLine: false,
    states: [],
    error: null,
  };

  try {
    const sql = getSql();
    const rows = await sql<
      Array<{
        state_code: string | null;
        institutions: number | string;
        any_featured: number | string;
        full_ready: number | string;
        viable_ready: number | string;
      }>
    >`
      WITH cov AS (
        SELECT institution_id, count(DISTINCT canonical_fee_key) AS n_featured
          FROM published_fee_catalog
         WHERE canonical_fee_key = ANY(${FEATURED_CATEGORIES as unknown as string[]})
         GROUP BY institution_id
      )
      SELECT s.state_code,
             count(*)::int AS institutions,
             count(c.institution_id)::int AS any_featured,
             count(*) FILTER (WHERE c.n_featured >= ${FULL_REPORT_CATEGORIES})::int AS full_ready,
             count(*) FILTER (WHERE c.n_featured >= ${VIABLE_REPORT_CATEGORIES})::int AS viable_ready
        FROM institution_sources s
        LEFT JOIN cov c ON c.institution_id = s.id
       WHERE s.state_code IS NOT NULL
       GROUP BY s.state_code
    `;

    const states: StateCoverage[] = rows.map((r) => ({
      stateCode: r.state_code ?? "??",
      institutions: Number(r.institutions),
      fullReportReady: Number(r.full_ready),
      viableReportReady: Number(r.viable_ready),
    }));

    const totals = states.reduce(
      (acc, s) => ({
        institutions: acc.institutions + s.institutions,
        full: acc.full + s.fullReportReady,
        viable: acc.viable + s.viableReportReady,
      }),
      { institutions: 0, full: 0, viable: 0 },
    );

    const withAnyFeaturedFee = rows.reduce((n, r) => n + Number(r.any_featured), 0);

    return {
      ...base,
      institutions: totals.institutions,
      withAnyFeaturedFee,
      fullReportReady: totals.full,
      viableReportReady: totals.viable,
      aboveLine: totals.viable >= REPORT_READY_TARGET,
      states: states
        .filter((s) => s.viableReportReady > 0)
        .sort((a, b) => b.viableReportReady - a.viableReportReady),
      error: null,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The sentence the stop rule turns into. Kept here so the admin surface and any
 * future brief say exactly the same thing.
 */
export function publishabilityVerdict(s: PublishabilitySnapshot): string {
  if (s.error) return "Coverage unreadable — treat the line as unknown.";
  if (s.aboveLine) {
    return `${s.viableReportReady} institutions are report-ready, at or above the target of ${s.target}. Pipeline work ranks below outward work.`;
  }
  return `${s.viableReportReady} institutions are report-ready against a target of ${s.target}. Coverage is the constraint on revenue and outranks other inward work.`;
}

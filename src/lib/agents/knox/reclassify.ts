import { sql } from "@/lib/data-store/connection";
import { normalizeStateCode } from "@/lib/agents/state-lane-memory";
import { classifySegment } from "@/lib/fee-classification";
import { plausibilityVerdict } from "@/lib/fee-plausibility";

type SqlTag = typeof sql;

/**
 * Knox reclassify — backfill the canonical hint onto raw rows that never got one.
 *
 * WHY THIS EXISTS
 *
 * Darwin resolves a row's canonical key from exactly two places: a
 * `canonical_hint:<key>` entry in `outlier_flags`, or a `canonical_hint=<key>`
 * substring in `conditions`. No hint means `verificationSkipReason` returns
 * "Missing or invalid canonical hint" before anything else is considered, and
 * the row can never be verified.
 *
 * Measured 2026-08-22 against production: of 104,370 rows in
 * `raw_fee_observations`, **zero** carry a readable hint. 102,965 of them were
 * loaded by the `migration_v10` import with `outlier_flags = '[]'`, and the
 * remainder came from a Knox build predating the current insert path. That
 * single missing string is the whole reason 104,370 raw rows have produced only
 * 6,401 verified ones.
 *
 * The data itself is fine — "Overdraft Daily Cap", "Courtesy Pay Daily Cap",
 * "NSF Return Fee Daily Cap", "Temporary Checks" — with correct `frequency` and
 * real qualifier text in `conditions`. It just needs classifying.
 *
 * WHAT IT DOES
 *
 * Reads `fee_name` plus `conditions`, runs the same `classifySegment` the live
 * extractor uses, and appends the hint to `outlier_flags`. Nothing else on the
 * row is touched: no amounts, no names, no lineage, no deletions. A row that
 * already has a readable hint is never selected.
 *
 * Defaults to a dry run. The report includes the projected Darwin outcome for
 * every row it would write, so the yield is measured before anything changes.
 */

export const KNOX_RECLASSIFY_DEFAULT_LIMIT = 500;
// 2,000 rows classified in well under a second of actual work (9s wall clock
// including run creation and pickup). 10,000 keeps a single step inside the
// 60-second budget with a wide margin.
export const KNOX_RECLASSIFY_MAX_LIMIT = 10_000;

/** Appended alongside the hint so the row enters Darwin's normal queue. */
const VERIFICATION_FLAG = "needs_darwin_verification";

interface UnhintedRawRow {
  fee_raw_id: number | string;
  institution_id: number | string;
  fee_name: string | null;
  amount: number | string | null;
  frequency: string | null;
  conditions: string | null;
  source: string | null;
  institution_name?: string | null;
}

export interface KnoxReclassifyRowResult {
  feeRawId: number;
  institutionId: number;
  feeName: string;
  canonicalHint: string | null;
  /** What Darwin would do with the row once the hint is present. */
  projectedOutcome: "verify" | "review" | "skip_no_amount" | "unclassified";
  projectedReason: string | null;
}

export interface RunKnoxReclassifyOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  stateCode?: string;
  /** Restrict to one writer, e.g. 'migration_v10'. Omit for all unhinted rows. */
  source?: string;
  dryRun?: boolean;
  db?: SqlTag;
}

export interface RunKnoxReclassifyResult {
  selectedRows: number;
  classifiedRows: number;
  unclassifiedRows: number;
  updatedRows: number;
  limit: number;
  dryRun: boolean;
  /** Projected Darwin outcome across everything classified this pass. */
  projected: {
    wouldVerify: number;
    wouldReview: number;
    skippedNoAmount: number;
  };
  /** Hint counts by canonical key, most common first. */
  keyDistribution: Array<{ canonicalFeeKey: string; rows: number }>;
  results: KnoxReclassifyRowResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return KNOX_RECLASSIFY_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), KNOX_RECLASSIFY_MAX_LIMIT);
}

function normalizedAmount(value: number | string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

/**
 * The classifier reads a whole schedule segment, not a bare label. `conditions`
 * routinely carries the qualifier that decides the key — "Maximum of 4 Courtesy
 * Pay fees per day" is what separates a cap from a fee — so both fields are fed
 * in, name first.
 */
export function reclassificationSegment(row: Pick<UnhintedRawRow, "fee_name" | "conditions">): string {
  return [row.fee_name ?? "", row.conditions ?? ""].join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Rows with no hint Darwin can read. Mirrors `canonicalHintFrom` in
 * darwin/verify.ts — keep the two in step.
 *
 * `FOR UPDATE SKIP LOCKED` claims the batch for this transaction so concurrent
 * ticks cannot select the same rows.
 */
async function selectUnhintedRows(
  db: SqlTag,
  limit: number,
  institutionId?: number,
  stateCode?: string,
  source?: string,
): Promise<UnhintedRawRow[]> {
  const params: Array<number | string> = [limit];
  const filters: string[] = [];
  if (institutionId) {
    params.push(institutionId);
    filters.push(`AND fr.institution_id = $${params.length}`);
  }
  const normalizedState = normalizeStateCode(stateCode);
  if (normalizedState) {
    params.push(normalizedState);
    filters.push(`AND upper(btrim(inst.state_code)) = $${params.length}`);
  }
  if (source) {
    params.push(source);
    filters.push(`AND fr.source = $${params.length}`);
  }
  return db.unsafe<UnhintedRawRow[]>(
    `
      SELECT fr.fee_raw_id,
             fr.institution_id,
             fr.fee_name,
             fr.amount,
             fr.frequency,
             fr.conditions,
             fr.source,
             inst.institution_name
        FROM raw_fee_observations fr
        JOIN institution_sources inst ON inst.id = fr.institution_id
       WHERE fr.fee_name IS NOT NULL
         AND btrim(fr.fee_name) <> ''
         ${filters.join("\n         ")}
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(COALESCE(fr.outlier_flags, '[]'::jsonb)) = 'array'
                         THEN fr.outlier_flags
                         ELSE '[]'::jsonb
                    END) AS flag
            WHERE flag LIKE 'canonical_hint:%'
         )
         AND (fr.conditions IS NULL OR fr.conditions !~* 'canonical_hint=[a-z0-9_]+')
       ORDER BY fr.fee_raw_id
       LIMIT $1
         FOR UPDATE OF fr SKIP LOCKED
    `,
    params,
  );
}

/**
 * Applies every hint for the batch in ONE statement.
 *
 * The first cut of this did a single-row UPDATE per hint, awaited in sequence.
 * That is fine against a local database and pathological against a remote one:
 * 10,000 rows became 10,000 round-trips and blew far past the per-step wall-time
 * budget. `unnest` turns the whole batch into one round-trip.
 *
 * Existing flags are preserved and a non-array `outlier_flags` is repaired to an
 * array in passing.
 */
async function applyHints(
  db: SqlTag,
  hints: Array<{ feeRawId: number; canonicalFeeKey: string }>,
): Promise<number> {
  if (hints.length === 0) return 0;
  const ids = hints.map((hint) => hint.feeRawId);
  const flags = hints.map((hint) => `canonical_hint:${hint.canonicalFeeKey}`);
  const updated = await db.unsafe<Array<{ fee_raw_id: number }>>(
    `
      UPDATE raw_fee_observations fr
         SET outlier_flags = (
               CASE WHEN jsonb_typeof(COALESCE(fr.outlier_flags, '[]'::jsonb)) = 'array'
                    THEN COALESCE(fr.outlier_flags, '[]'::jsonb)
                    ELSE '[]'::jsonb
               END
             ) || to_jsonb(ARRAY[batch.hint, $3::text])
        FROM (
          SELECT unnest($1::bigint[]) AS fee_raw_id,
                 unnest($2::text[])   AS hint
        ) AS batch
       WHERE fr.fee_raw_id = batch.fee_raw_id
       RETURNING fr.fee_raw_id
    `,
    [ids, flags, VERIFICATION_FLAG],
  );
  return updated.length;
}

export async function runKnoxReclassify(
  options: RunKnoxReclassifyOptions,
): Promise<RunKnoxReclassifyResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  // Dry run is the default: this touches six figures of rows, so writing has to
  // be asked for explicitly rather than assumed.
  const dryRun = options.dryRun !== false;

  const rows = await selectUnhintedRows(db, limit, options.institutionId, options.stateCode, options.source);

  const results: KnoxReclassifyRowResult[] = [];
  const pendingHints: Array<{ feeRawId: number; canonicalFeeKey: string }> = [];
  const keyCounts = new Map<string, number>();
  let classifiedRows = 0;
  let updatedRows = 0;
  let wouldVerify = 0;
  let wouldReview = 0;
  let skippedNoAmount = 0;

  for (const row of rows) {
    const feeRawId = Number(row.fee_raw_id);
    const institutionId = Number(row.institution_id);
    const feeName = (row.fee_name ?? "").trim();
    const canonicalHint = classifySegment(reclassificationSegment(row));

    if (!canonicalHint) {
      results.push({
        feeRawId,
        institutionId,
        feeName,
        canonicalHint: null,
        projectedOutcome: "unclassified",
        projectedReason: "No pattern matches this fee name",
      });
      continue;
    }

    classifiedRows += 1;
    keyCounts.set(canonicalHint, (keyCounts.get(canonicalHint) ?? 0) + 1);

    // Reproduce Darwin's gate so the report states the real yield rather than
    // the number of rows touched.
    const amount = normalizedAmount(row.amount);
    let projectedOutcome: KnoxReclassifyRowResult["projectedOutcome"];
    let projectedReason: string | null = null;
    if (amount == null || amount <= 0) {
      projectedOutcome = "skip_no_amount";
      projectedReason = "Missing or invalid amount — Darwin skips regardless of hint";
      skippedNoAmount += 1;
    } else {
      const verdict = plausibilityVerdict(canonicalHint, amount, row.frequency);
      if (verdict.status === "ok") {
        projectedOutcome = "verify";
        wouldVerify += 1;
      } else {
        projectedOutcome = "review";
        projectedReason = verdict.reason ?? "Held by the plausibility envelope";
        wouldReview += 1;
      }
    }

    pendingHints.push({ feeRawId, canonicalFeeKey: canonicalHint });
    results.push({ feeRawId, institutionId, feeName, canonicalHint, projectedOutcome, projectedReason });
  }

  if (!dryRun) {
    updatedRows = await applyHints(db, pendingHints);
  }

  return {
    selectedRows: rows.length,
    classifiedRows,
    unclassifiedRows: rows.length - classifiedRows,
    updatedRows,
    limit,
    dryRun,
    projected: { wouldVerify, wouldReview, skippedNoAmount },
    keyDistribution: [...keyCounts.entries()]
      .map(([canonicalFeeKey, count]) => ({ canonicalFeeKey, rows: count }))
      .sort((a, b) => b.rows - a.rows),
    results,
  };
}

import type { sql } from "@/lib/crawler-db/connection";

type SqlTag = typeof sql;

export const KNOX_READY_REVIEW_DEFAULT_LIMIT = 500;
export const KNOX_READY_REVIEW_MAX_LIMIT = 5_000;
export const KNOX_READY_REVIEW_MIN_CONFIDENCE = 0.9;

const SYSTEM_REVIEW_ACTOR = "knox-agent";

interface ReviewReadyStagedFeesOptions {
  runId: number;
  dryRun?: boolean;
  actor?: string;
  limit?: number;
  minConfidence?: number;
}

export interface ReviewReadyStagedFeesResult {
  stagedBefore: number;
  readyBefore: number;
  approved: number;
  auditRows: number;
  stagedAfter: number;
  flagged: number;
  pending: number;
  limit: number;
  minConfidence: number;
  dryRun: boolean;
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return KNOX_READY_REVIEW_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), KNOX_READY_REVIEW_MAX_LIMIT);
}

function boundedConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return KNOX_READY_REVIEW_MIN_CONFIDENCE;
  return Math.min(Math.max(parsed, 0.5), 1);
}

async function countRows(
  tx: SqlTag,
  where: string,
  params: Array<number | string> = [],
): Promise<number> {
  const rows = await tx.unsafe<{ count: number | string }[]>(
    `SELECT COUNT(*)::int AS count FROM extracted_fees ef WHERE ${where}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

function readyWhereClause(paramIndex = 1): string {
  return `
    ef.review_status = 'staged'
    AND COALESCE(ef.extraction_confidence, 0) >= $${paramIndex}
    AND ef.fee_category IS NOT NULL
    AND btrim(ef.fee_category) <> ''
    AND ef.fee_name IS NOT NULL
    AND btrim(ef.fee_name) <> ''
    AND (
      ef.validation_flags IS NULL
      OR ef.validation_flags = '[]'::jsonb
      OR ef.validation_flags = '{}'::jsonb
    )
    AND NOT EXISTS (
      SELECT 1
        FROM fee_reviews fr
       WHERE fr.fee_id = ef.id
         AND COALESCE(fr.username, '') NOT IN ('system', 'knox-agent', 'darwin-agent', 'atlas-agent', 'hamilton-agent')
         AND fr.action <> 'unstage'
    )
  `;
}

export async function reviewReadyStagedFees(
  tx: SqlTag,
  options: ReviewReadyStagedFeesOptions,
): Promise<ReviewReadyStagedFeesResult> {
  const limit = boundedLimit(options.limit);
  const minConfidence = boundedConfidence(options.minConfidence);
  const actor = options.actor?.trim() || SYSTEM_REVIEW_ACTOR;
  const dryRun = Boolean(options.dryRun);
  const readyWhere = readyWhereClause(1);

  const [stagedBefore, readyBefore, flagged, pending] = await Promise.all([
    countRows(tx, "ef.review_status = 'staged'"),
    countRows(tx, readyWhere, [minConfidence]),
    countRows(tx, "ef.review_status = 'flagged'"),
    countRows(tx, "ef.review_status = 'pending'"),
  ]);

  if (dryRun || readyBefore === 0) {
    return {
      stagedBefore,
      readyBefore,
      approved: 0,
      auditRows: 0,
      stagedAfter: stagedBefore,
      flagged,
      pending,
      limit,
      minConfidence,
      dryRun,
    };
  }

  const notes =
    `Knox agentic ready-review run #${options.runId}: auto-approved staged fees ` +
    `with confidence >= ${(minConfidence * 100).toFixed(0)}%, category present, and no validation flags. ` +
    "Compatibility status update while product reads migrate to tiered fee tables.";

  await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
  const [reviewRow] = await tx.unsafe<{ approved: number | string; audit_rows: number | string }[]>(
    `
      WITH candidates AS (
        SELECT ef.id
          FROM extracted_fees ef
         WHERE ${readyWhere}
         ORDER BY ef.extraction_confidence DESC NULLS LAST, ef.created_at ASC, ef.id ASC
         LIMIT $2
      ),
      updated AS (
        UPDATE extracted_fees ef
           SET review_status = 'approved'
          FROM candidates c
         WHERE ef.id = c.id
         RETURNING ef.id
      ),
      reviews AS (
        INSERT INTO fee_reviews
          (fee_id, action, user_id, username, previous_status, new_status, notes)
        SELECT id, 'agentic_ready_approve', NULL, $3, 'staged', 'approved', $4
          FROM updated
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*)::int FROM updated) AS approved,
        (SELECT COUNT(*)::int FROM reviews) AS audit_rows
    `,
    [minConfidence, limit, actor, notes],
  );

  const approved = Number(reviewRow?.approved ?? 0);
  const auditRows = Number(reviewRow?.audit_rows ?? 0);
  const stagedAfter = Math.max(0, stagedBefore - approved);

  return {
    stagedBefore,
    readyBefore,
    approved,
    auditRows,
    stagedAfter,
    flagged,
    pending,
    limit,
    minConfidence,
    dryRun,
  };
}

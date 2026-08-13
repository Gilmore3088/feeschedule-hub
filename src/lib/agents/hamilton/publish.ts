import { createHash } from "crypto";

import { sql } from "@/lib/data-store/connection";
import { CANONICAL_KEY_MAP } from "@/lib/fee-taxonomy";

type SqlTag = typeof sql;

export const HAMILTON_PUBLISH_DEFAULT_LIMIT = 100;
export const HAMILTON_PUBLISH_MAX_LIMIT = 500;
export const HAMILTON_PUBLISH_DEFAULT_MIN_CONFIDENCE = 0.8;

const VALID_CANONICAL_KEYS = new Set(Object.values(CANONICAL_KEY_MAP));
const BLOCKING_FLAGS = new Set([
  "ambiguous",
  "challenge",
  "challenged",
  "lineage_missing",
  "needs_human",
  "needs_manual_review",
  "outlier",
  "rejected",
]);

interface VerifiedFeeRow {
  fee_verified_id: number | string;
  fee_raw_id: number | string;
  institution_id: number | string;
  source_url: string | null;
  document_r2_key: string | null;
  extraction_confidence: number | string | null;
  canonical_fee_key: string;
  variant_type: string | null;
  outlier_flags: unknown;
  verified_by_agent_event_id: string;
  fee_name: string;
  amount: number | string | null;
  frequency: string | null;
  raw_agent_event_id: string | null;
}

export interface HamiltonPublishResult {
  feeVerifiedId: number;
  institutionId: number;
  feeName: string;
  amount: number | null;
  canonicalFeeKey: string;
  status: "published" | "skipped";
  reason: string | null;
  feePublishedId: number | null;
}

export interface RunHamiltonPublishOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  minConfidence?: number;
  dryRun?: boolean;
  db?: SqlTag;
}

export interface RunHamiltonPublishResult {
  selectedVerifiedFees: number;
  processedVerifiedFees: number;
  publishedFees: number;
  skippedFees: number;
  limit: number;
  minConfidence: number;
  dryRun: boolean;
  batchId: string;
  results: HamiltonPublishResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return HAMILTON_PUBLISH_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), HAMILTON_PUBLISH_MAX_LIMIT);
}

function boundedConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return HAMILTON_PUBLISH_DEFAULT_MIN_CONFIDENCE;
  return Math.min(Math.max(parsed, 0), 1);
}

function parseFlags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseFlags(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function normalizedAmount(value: number | string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizedConfidence(value: number | string | null): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 1);
}

function coverageTier(confidence: number): "strong" | "provisional" {
  return confidence >= 0.9 ? "strong" : "provisional";
}

function publishSkipReason(row: VerifiedFeeRow, minConfidence: number): string | null {
  const flags = parseFlags(row.outlier_flags);
  if (!flags.includes("agentic_darwin_verified")) return "Not verified by the agentic Darwin path";
  const blockingFlag = flags.find((flag) => BLOCKING_FLAGS.has(flag));
  if (blockingFlag) return `Blocking flag: ${blockingFlag}`;
  if (!VALID_CANONICAL_KEYS.has(row.canonical_fee_key)) return "Invalid canonical fee key";
  if (!row.fee_name?.trim()) return "Missing fee name";
  if (!row.source_url?.trim() && !row.document_r2_key?.trim()) return "Missing source lineage";
  const amount = normalizedAmount(row.amount);
  if (amount == null || amount <= 0) return "Missing or invalid amount";
  if (amount > 2_500) return "Amount outside deterministic publish range";
  if (normalizedConfidence(row.extraction_confidence) < minConfidence) {
    return "Below publish confidence threshold";
  }
  return null;
}

async function selectVerifiedFees(
  db: SqlTag,
  limit: number,
  institutionId?: number,
): Promise<VerifiedFeeRow[]> {
  const targetFilter = institutionId ? "AND fv.institution_id = $2" : "";
  const params = institutionId ? [limit, institutionId] : [limit];
  return db.unsafe<VerifiedFeeRow[]>(
    `
      SELECT fv.fee_verified_id,
             fv.fee_raw_id,
             fv.institution_id,
             fv.source_url,
             fv.document_r2_key,
             fv.extraction_confidence,
             fv.canonical_fee_key,
             fv.variant_type,
             fv.outlier_flags,
             fv.verified_by_agent_event_id,
             fv.fee_name,
             fv.amount,
             fv.frequency,
             fr.agent_event_id AS raw_agent_event_id
        FROM fees_verified fv
        JOIN fees_raw fr ON fr.fee_raw_id = fv.fee_raw_id
       WHERE fv.review_status IN ('verified', 'approved')
         AND fv.outlier_flags ? 'agentic_darwin_verified'
         ${targetFilter}
         AND NOT EXISTS (
           SELECT 1
             FROM fees_published fp
            WHERE fp.lineage_ref = fv.fee_verified_id
              AND fp.rolled_back_at IS NULL
         )
       ORDER BY fv.created_at ASC, fv.fee_verified_id ASC
       LIMIT $1
    `,
    params,
  );
}

async function insertPublishedFee(
  db: SqlTag,
  options: {
    runId: number;
    batchId: string;
    row: VerifiedFeeRow;
  },
): Promise<number | null> {
  const feeVerifiedId = Number(options.row.fee_verified_id);
  const institutionId = Number(options.row.institution_id);
  const confidence = normalizedConfidence(options.row.extraction_confidence);
  const amount = normalizedAmount(options.row.amount);
  const publishEventId = stableUuid(
    `hamilton:${options.runId}:${feeVerifiedId}:${options.row.canonical_fee_key}`,
  );
  const inserted = await db`
    INSERT INTO fees_published (
      lineage_ref,
      institution_id,
      canonical_fee_key,
      source_url,
      document_r2_key,
      extraction_confidence,
      agent_event_id,
      verified_by_agent_event_id,
      published_by_adversarial_event_id,
      fee_name,
      amount,
      frequency,
      variant_type,
      coverage_tier,
      batch_id
    )
    VALUES (
      ${feeVerifiedId},
      ${institutionId},
      ${options.row.canonical_fee_key},
      ${options.row.source_url},
      ${options.row.document_r2_key},
      ${confidence},
      ${options.row.raw_agent_event_id}::uuid,
      ${options.row.verified_by_agent_event_id}::uuid,
      ${publishEventId}::uuid,
      ${options.row.fee_name},
      ${amount},
      ${options.row.frequency},
      ${options.row.variant_type},
      ${coverageTier(confidence)},
      ${options.batchId}
    )
    ON CONFLICT DO NOTHING
    RETURNING fee_published_id
  `;
  return inserted[0]?.fee_published_id == null ? null : Number(inserted[0].fee_published_id);
}

export async function runHamiltonPublish(
  options: RunHamiltonPublishOptions,
): Promise<RunHamiltonPublishResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  const minConfidence = boundedConfidence(options.minConfidence);
  const dryRun = Boolean(options.dryRun);
  const batchId = `agentic-run-${options.runId}`;
  const rows = await selectVerifiedFees(db, limit, options.institutionId);
  const results: HamiltonPublishResult[] = [];

  for (const row of rows) {
    const skipReason = publishSkipReason(row, minConfidence);
    if (skipReason) {
      results.push({
        feeVerifiedId: Number(row.fee_verified_id),
        institutionId: Number(row.institution_id),
        feeName: row.fee_name,
        amount: normalizedAmount(row.amount),
        canonicalFeeKey: row.canonical_fee_key,
        status: "skipped",
        reason: skipReason,
        feePublishedId: null,
      });
      continue;
    }

    const feePublishedId = dryRun
      ? null
      : await insertPublishedFee(db, { runId: options.runId, batchId, row });
    results.push({
      feeVerifiedId: Number(row.fee_verified_id),
      institutionId: Number(row.institution_id),
      feeName: row.fee_name,
      amount: normalizedAmount(row.amount),
      canonicalFeeKey: row.canonical_fee_key,
      status: feePublishedId || dryRun ? "published" : "skipped",
      reason: feePublishedId || dryRun ? null : "Duplicate published row",
      feePublishedId,
    });
  }

  return {
    selectedVerifiedFees: rows.length,
    processedVerifiedFees: results.length,
    publishedFees: results.filter((result) => result.status === "published").length,
    skippedFees: results.filter((result) => result.status === "skipped").length,
    limit,
    minConfidence,
    dryRun,
    batchId,
    results,
  };
}

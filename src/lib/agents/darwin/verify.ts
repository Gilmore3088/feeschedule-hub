import { createHash } from "crypto";

import { sql } from "@/lib/data-store/connection";
import { CANONICAL_KEY_MAP } from "@/lib/fee-taxonomy";

type SqlTag = typeof sql;

export const DARWIN_VERIFY_DEFAULT_LIMIT = 100;
export const DARWIN_VERIFY_MAX_LIMIT = 500;

const VALID_CANONICAL_KEYS = new Set(Object.values(CANONICAL_KEY_MAP));

interface RawFeeRow {
  fee_raw_id: number | string;
  institution_id: number | string;
  source_url: string | null;
  document_r2_key: string | null;
  extraction_confidence: number | string | null;
  fee_name: string;
  amount: number | string | null;
  frequency: string | null;
  outlier_flags: unknown;
  conditions: string | null;
}

export interface DarwinVerificationResult {
  feeRawId: number;
  institutionId: number;
  feeName: string;
  amount: number | null;
  canonicalFeeKey: string | null;
  status: "verified" | "skipped";
  reason: string | null;
  feeVerifiedId: number | null;
}

export interface RunDarwinVerifyOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  dryRun?: boolean;
  db?: SqlTag;
}

export interface RunDarwinVerifyResult {
  selectedRawFees: number;
  processedRawFees: number;
  verifiedFees: number;
  skippedFees: number;
  limit: number;
  dryRun: boolean;
  results: DarwinVerificationResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DARWIN_VERIFY_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), DARWIN_VERIFY_MAX_LIMIT);
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

function canonicalHintFrom(row: RawFeeRow): string | null {
  const fromFlag = parseFlags(row.outlier_flags)
    .find((flag) => flag.startsWith("canonical_hint:"))
    ?.slice("canonical_hint:".length)
    .trim();
  const hint = fromFlag || row.conditions?.match(/canonical_hint=([a-z0-9_]+)/i)?.[1] || null;
  if (!hint) return null;
  return VALID_CANONICAL_KEYS.has(hint) ? hint : null;
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

function verificationSkipReason(row: RawFeeRow, canonicalFeeKey: string | null): string | null {
  if (!canonicalFeeKey) return "Missing or invalid canonical hint";
  if (!row.fee_name?.trim()) return "Missing fee name";
  const amount = normalizedAmount(row.amount);
  if (amount == null || amount <= 0) return "Missing or invalid amount";
  if (amount > 2_500) return "Amount outside deterministic verification range";
  return null;
}

async function selectRawFees(
  db: SqlTag,
  limit: number,
  institutionId?: number,
): Promise<RawFeeRow[]> {
  const targetFilter = institutionId ? "AND fr.institution_id = $2" : "";
  const params = institutionId ? [limit, institutionId] : [limit];
  return db.unsafe<RawFeeRow[]>(
    `
      SELECT fr.fee_raw_id,
             fr.institution_id,
             fr.source_url,
             fr.document_r2_key,
             fr.extraction_confidence,
             fr.fee_name,
             fr.amount,
             fr.frequency,
             fr.outlier_flags,
             fr.conditions
        FROM fees_raw fr
       WHERE fr.source = 'knox'
         AND fr.outlier_flags ? 'needs_darwin_verification'
         ${targetFilter}
         AND NOT EXISTS (
           SELECT 1
             FROM fees_verified fv
            WHERE fv.fee_raw_id = fr.fee_raw_id
         )
       ORDER BY fr.created_at ASC, fr.fee_raw_id ASC
       LIMIT $1
    `,
    params,
  );
}

async function insertVerifiedFee(
  db: SqlTag,
  options: {
    runId: number;
    row: RawFeeRow;
    canonicalFeeKey: string;
  },
): Promise<number | null> {
  const feeRawId = Number(options.row.fee_raw_id);
  const institutionId = Number(options.row.institution_id);
  const amount = normalizedAmount(options.row.amount);
  const eventId = stableUuid(`darwin:${options.runId}:${feeRawId}:${options.canonicalFeeKey}`);
  const flags = ["agentic_darwin_verified"];
  const inserted = await db`
    INSERT INTO fees_verified (
      fee_raw_id,
      institution_id,
      source_url,
      document_r2_key,
      extraction_confidence,
      canonical_fee_key,
      variant_type,
      outlier_flags,
      verified_by_agent_event_id,
      fee_name,
      amount,
      frequency,
      review_status
    )
    VALUES (
      ${feeRawId},
      ${institutionId},
      ${options.row.source_url},
      ${options.row.document_r2_key},
      ${options.row.extraction_confidence},
      ${options.canonicalFeeKey},
      ${null},
      ${JSON.stringify(flags)}::jsonb,
      ${eventId}::uuid,
      ${options.row.fee_name},
      ${amount},
      ${options.row.frequency},
      'verified'
    )
    ON CONFLICT DO NOTHING
    RETURNING fee_verified_id
  `;
  return inserted[0]?.fee_verified_id == null ? null : Number(inserted[0].fee_verified_id);
}

export async function runDarwinVerify(
  options: RunDarwinVerifyOptions,
): Promise<RunDarwinVerifyResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectRawFees(db, limit, options.institutionId);
  const results: DarwinVerificationResult[] = [];

  for (const row of rows) {
    const canonicalFeeKey = canonicalHintFrom(row);
    const skipReason = verificationSkipReason(row, canonicalFeeKey);
    if (skipReason || !canonicalFeeKey) {
      results.push({
        feeRawId: Number(row.fee_raw_id),
        institutionId: Number(row.institution_id),
        feeName: row.fee_name,
        amount: normalizedAmount(row.amount),
        canonicalFeeKey,
        status: "skipped",
        reason: skipReason ?? "Not verified",
        feeVerifiedId: null,
      });
      continue;
    }

    const feeVerifiedId = dryRun
      ? null
      : await insertVerifiedFee(db, { runId: options.runId, row, canonicalFeeKey });
    results.push({
      feeRawId: Number(row.fee_raw_id),
      institutionId: Number(row.institution_id),
      feeName: row.fee_name,
      amount: normalizedAmount(row.amount),
      canonicalFeeKey,
      status: feeVerifiedId || dryRun ? "verified" : "skipped",
      reason: feeVerifiedId || dryRun ? null : "Duplicate verified row",
      feeVerifiedId,
    });
  }

  return {
    selectedRawFees: rows.length,
    processedRawFees: results.length,
    verifiedFees: results.filter((result) => result.status === "verified").length,
    skippedFees: results.filter((result) => result.status === "skipped").length,
    limit,
    dryRun,
    results,
  };
}

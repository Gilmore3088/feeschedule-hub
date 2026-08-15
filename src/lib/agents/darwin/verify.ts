import { createHash } from "crypto";

import { sql } from "@/lib/data-store/connection";
import { normalizeStateCode } from "@/lib/agents/state-lane-memory";
import { CANONICAL_KEY_MAP } from "@/lib/fee-taxonomy";
import { recordHamiltonMonitorSignal } from "@/lib/hamilton/monitor-signals";

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
  institution_name?: string | null;
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
  stateCode?: string;
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
  stateCode?: string,
): Promise<RawFeeRow[]> {
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
             fr.conditions,
             inst.institution_name
        FROM raw_fee_observations fr
        JOIN institution_sources inst ON inst.id = fr.institution_id
       WHERE fr.source = 'knox'
         AND fr.outlier_flags ? 'needs_darwin_verification'
         ${filters.join("\n         ")}
         AND NOT EXISTS (
           SELECT 1
             FROM verified_fee_observations fv
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
    INSERT INTO verified_fee_observations (
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

function institutionLabel(row: Pick<RawFeeRow, "institution_id" | "institution_name">): string {
  return row.institution_name?.trim() || `Institution ${row.institution_id}`;
}

function rowCountLabel(count: number): string {
  return `${count} fee row${count === 1 ? "" : "s"}`;
}

async function recordVerificationSignals(
  db: SqlTag,
  runId: number,
  results: DarwinVerificationResult[],
  rowByRawFeeId: Map<number, RawFeeRow>,
): Promise<void> {
  const grouped = new Map<number, {
    institutionName: string;
    feeRawIds: number[];
    feeVerifiedIds: number[];
    canonicalFeeKeys: string[];
  }>();
  const reviewGrouped = new Map<number, {
    institutionName: string;
    feeRawIds: number[];
    canonicalFeeKeys: string[];
    reasons: Map<string, number>;
  }>();

  results.forEach((result) => {
    const row = rowByRawFeeId.get(result.feeRawId);
    const institutionId = result.institutionId;
    if (result.status === "skipped") {
      const group = reviewGrouped.get(institutionId) ?? {
        institutionName: row ? institutionLabel(row) : `Institution ${institutionId}`,
        feeRawIds: [],
        canonicalFeeKeys: [],
        reasons: new Map<string, number>(),
      };
      group.feeRawIds.push(result.feeRawId);
      if (result.canonicalFeeKey) group.canonicalFeeKeys.push(result.canonicalFeeKey);
      const reason = result.reason ?? "Skipped during deterministic verification";
      group.reasons.set(reason, (group.reasons.get(reason) ?? 0) + 1);
      reviewGrouped.set(institutionId, group);
      return;
    }

    if (result.status !== "verified" || !result.feeVerifiedId) return;
    const group = grouped.get(institutionId) ?? {
      institutionName: row ? institutionLabel(row) : `Institution ${institutionId}`,
      feeRawIds: [],
      feeVerifiedIds: [],
      canonicalFeeKeys: [],
    };
    group.feeRawIds.push(result.feeRawId);
    group.feeVerifiedIds.push(result.feeVerifiedId);
    if (result.canonicalFeeKey) group.canonicalFeeKeys.push(result.canonicalFeeKey);
    grouped.set(institutionId, group);
  });

  for (const [institutionId, group] of grouped) {
    const count = group.feeVerifiedIds.length;
    await recordHamiltonMonitorSignal(
      {
        institutionId,
        signalType: "darwin_verification_completed",
        severity: "medium",
        title: `${group.institutionName} - ${rowCountLabel(count)} verified`,
        body:
          `Darwin verified ${rowCountLabel(count)} from source-grounded Knox observations. ` +
          "These rows are ready for Hamilton publication review before verified benchmark scoring changes.",
        sourceJson: {
          source: "darwin_verification",
          run_id: runId,
          pipeline_stage: "verified_unpublished",
          verified_fee_ids: group.feeVerifiedIds,
          raw_fee_ids: group.feeRawIds,
          canonical_fee_keys: Array.from(new Set(group.canonicalFeeKeys)),
          verified_fee_count: count,
          provider_call_queued: false,
        },
      },
      db,
    ).catch((error) => {
      console.error("recordDarwinVerificationSignal failed:", error);
    });
  }

  for (const [institutionId, group] of reviewGrouped) {
    const count = group.feeRawIds.length;
    await recordHamiltonMonitorSignal(
      {
        institutionId,
        signalType: "darwin_verification_needs_review",
        severity: "medium",
        title: `${group.institutionName} - ${rowCountLabel(count)} needs verification review`,
        body:
          `Darwin skipped ${rowCountLabel(count)} during deterministic verification. ` +
          "Review canonical hints, amounts, and source lineage before publishing or using these rows in benchmark scoring.",
        sourceJson: {
          source: "darwin_verification",
          run_id: runId,
          pipeline_stage: "verification_needs_review",
          raw_fee_ids: group.feeRawIds,
          canonical_fee_keys: Array.from(new Set(group.canonicalFeeKeys)),
          reason_counts: Object.fromEntries(group.reasons),
          skipped_fee_count: count,
          provider_call_queued: false,
        },
      },
      db,
    ).catch((error) => {
      console.error("recordDarwinVerificationReviewSignal failed:", error);
    });
  }
}

export async function runDarwinVerify(
  options: RunDarwinVerifyOptions,
): Promise<RunDarwinVerifyResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectRawFees(db, limit, options.institutionId, options.stateCode);
  const rowByRawFeeId = new Map(rows.map((row) => [Number(row.fee_raw_id), row]));
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

  if (!dryRun) {
    await recordVerificationSignals(db, options.runId, results, rowByRawFeeId);
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

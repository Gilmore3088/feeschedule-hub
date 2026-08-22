import { createHash } from "crypto";

import { sql } from "@/lib/data-store/connection";
import { normalizeStateCode } from "@/lib/agents/state-lane-memory";
import { classifySegment } from "@/lib/fee-classification";
import { recordHamiltonMonitorSignal } from "@/lib/hamilton/monitor-signals";

// The pattern table and resolver live in `@/lib/fee-classification` so they can
// be imported by tests and offline audit harnesses without pulling in the
// database connection above. Re-exported here so existing imports keep working.
export { FEE_PATTERNS, classifySegment } from "@/lib/fee-classification";
export type { FeePattern } from "@/lib/fee-classification";

type SqlTag = typeof sql;

export const KNOX_EXTRACT_DEFAULT_LIMIT = 25;
export const KNOX_EXTRACT_MAX_LIMIT = 100;

const MAX_SEGMENTS_PER_DOCUMENT = 150;
const MAX_FEES_PER_DOCUMENT = 75;
const MAX_SEGMENT_CHARS = 280;
const MIN_SEGMENT_CHARS = 8;
const MAX_REASONABLE_FEE_AMOUNT = 2_500;

interface TextArtifactRow {
  document_text_id: number | string;
  source_document_id: number | string;
  institution_id: number | string;
  source_url: string | null;
  normalized_text: string;
  text_hash: string | null;
  institution_name?: string | null;
}

export interface ExtractedFeeCandidate {
  feeName: string;
  amount: number;
  frequency: string | null;
  canonicalHint: string;
  confidence: number;
  excerpt: string;
}

export interface KnoxExtractDocumentResult {
  documentTextId: number;
  sourceDocumentId: number;
  institutionId: number;
  sourceUrl: string | null;
  extracted: number;
  inserted: number;
  skipped: number;
  candidates: ExtractedFeeCandidate[];
}

export interface RunKnoxExtractOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  stateCode?: string;
  dryRun?: boolean;
  db?: SqlTag;
}

export interface RunKnoxExtractResult {
  selectedDocuments: number;
  processedDocuments: number;
  extractedFees: number;
  insertedFees: number;
  skippedFees: number;
  limit: number;
  dryRun: boolean;
  results: KnoxExtractDocumentResult[];
}


const AMOUNT_PATTERN = /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/g;

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return KNOX_EXTRACT_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), KNOX_EXTRACT_MAX_LIMIT);
}

function normalizeSegment(value: string): string {
  return value
    .replace(/[•*·]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|:;]+/, "")
    .replace(/[\s|:;]+$/, "")
    .trim();
}

function candidateSegments(text: string): string[] {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = normalizeSegment(rawLine);
    if (!line.includes("$")) continue;
    const parts = line.length > MAX_SEGMENT_CHARS ? line.split(/\s{2,}|[.;]\s+/) : [line];
    for (const part of parts) {
      const segment = normalizeSegment(part);
      if (
        segment.length < MIN_SEGMENT_CHARS ||
        segment.length > MAX_SEGMENT_CHARS ||
        !segment.includes("$") ||
        seen.has(segment)
      ) {
        continue;
      }
      seen.add(segment);
      segments.push(segment);
      if (segments.length >= MAX_SEGMENTS_PER_DOCUMENT) return segments;
    }
  }
  return segments;
}


function containsNegativeFeeLanguage(segment: string): boolean {
  return /\b(no fee|no charge|free|waiv(?:e|ed)|not charged|without charge)\b/i.test(segment);
}

function containsGenericScheduleLanguage(segment: string): boolean {
  return /\b(schedule of fees|fee schedule|truth in savings|effective date|member fdic)\b/i.test(segment);
}

function parseAmount(segment: string): number | null {
  AMOUNT_PATTERN.lastIndex = 0;
  const match = AMOUNT_PATTERN.exec(segment);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_REASONABLE_FEE_AMOUNT) return null;
  const suffix = segment.slice(match.index + match[0].length, match.index + match[0].length + 3);
  if (suffix.includes("%")) return null;
  return Math.round(amount * 100) / 100;
}

function extractFeeName(segment: string): string {
  AMOUNT_PATTERN.lastIndex = 0;
  const match = AMOUNT_PATTERN.exec(segment);
  const beforeAmount = match ? segment.slice(0, match.index) : segment;
  const cleaned = normalizeSegment(beforeAmount)
    .replace(/\b(fee|charge)\s*$/i, "$1")
    .replace(/\s+\.+$/, "")
    .trim();
  const fallback = normalizeSegment(segment.replace(AMOUNT_PATTERN, " "));
  const feeName = cleaned.length >= 3 ? cleaned : fallback;
  return feeName.slice(0, 120).trim();
}

function detectFrequency(segment: string): string | null {
  if (/\b(monthly|per month|\/month|each month)\b/i.test(segment)) return "monthly";
  if (/\b(annual|annually|per year|yearly|\/year)\b/i.test(segment)) return "annual";
  if (/\b(per item|each item|per presentment)\b/i.test(segment)) return "per_item";
  if (/\b(per transaction|each transaction)\b/i.test(segment)) return "per_transaction";
  if (/\b(per day|daily)\b/i.test(segment)) return "daily";
  return null;
}

function confidenceFor(segment: string, canonicalHint: string): number {
  let confidence = 0.72;
  if (/\bfee\b/i.test(segment)) confidence += 0.06;
  if (/\bcharge\b/i.test(segment)) confidence += 0.03;
  if (canonicalHint) confidence += 0.1;
  if (segment.length <= 120) confidence += 0.04;
  return Math.min(confidence, 0.94);
}

function extractCandidatesFromText(text: string): ExtractedFeeCandidate[] {
  const seen = new Set<string>();
  const candidates: ExtractedFeeCandidate[] = [];
  for (const segment of candidateSegments(text)) {
    if (containsNegativeFeeLanguage(segment) || containsGenericScheduleLanguage(segment)) continue;
    const canonicalHint = classifySegment(segment);
    if (!canonicalHint) continue;
    const amount = parseAmount(segment);
    if (amount == null) continue;
    const feeName = extractFeeName(segment);
    if (feeName.length < 3 || /^\$/.test(feeName)) continue;
    const key = `${canonicalHint}:${feeName.toLowerCase()}:${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      feeName,
      amount,
      frequency: detectFrequency(segment),
      canonicalHint,
      confidence: confidenceFor(segment, canonicalHint),
      excerpt: segment,
    });
    if (candidates.length >= MAX_FEES_PER_DOCUMENT) break;
  }
  return candidates;
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

async function selectTextArtifacts(
  db: SqlTag,
  limit: number,
  institutionId?: number,
  stateCode?: string,
): Promise<TextArtifactRow[]> {
  const params: Array<number | string> = [limit];
  const filters: string[] = [];
  if (institutionId) {
    params.push(institutionId);
    filters.push(`AND adt.institution_id = $${params.length}`);
  }
  const normalizedState = normalizeStateCode(stateCode);
  if (normalizedState) {
    params.push(normalizedState);
    filters.push(`AND upper(btrim(inst.state_code)) = $${params.length}`);
  }
  return db.unsafe<TextArtifactRow[]>(
    `
      SELECT adt.id AS document_text_id,
             adt.source_document_id,
             adt.institution_id,
             adt.source_url,
             adt.normalized_text,
             adt.text_hash,
             inst.institution_name
        FROM agent_source_texts adt
        JOIN institution_sources inst ON inst.id = adt.institution_id
       WHERE adt.status = 'completed'
         AND adt.normalized_text IS NOT NULL
         AND adt.char_count > 0
         ${filters.join("\n         ")}
         AND NOT EXISTS (
           SELECT 1
             FROM raw_fee_observations fr
            WHERE fr.source = 'knox'
              AND fr.source_document_id = adt.source_document_id
         )
       ORDER BY adt.updated_at DESC, adt.id DESC
       LIMIT $1
    `,
    params,
  );
}

async function insertCandidate(
  db: SqlTag,
  options: {
    runId: number;
    row: TextArtifactRow;
    candidate: ExtractedFeeCandidate;
  },
): Promise<boolean> {
  const documentTextId = Number(options.row.document_text_id);
  const sourceDocumentId = Number(options.row.source_document_id);
  const institutionId = Number(options.row.institution_id);
  const agentEventId = stableUuid(
    `knox:${options.runId}:${documentTextId}:${sourceDocumentId}:${options.candidate.canonicalHint}:${options.candidate.feeName}:${options.candidate.amount}`,
  );
  const flags = ["needs_darwin_verification", `canonical_hint:${options.candidate.canonicalHint}`];
  const conditions =
    `Knox deterministic extraction from Rosetta artifact #${documentTextId}. ` +
    `canonical_hint=${options.candidate.canonicalHint}; text_hash=${options.row.text_hash ?? "unknown"}; ` +
    `excerpt="${options.candidate.excerpt.slice(0, 180)}"`;
  const inserted = await db`
    INSERT INTO raw_fee_observations (
      institution_id,
      source_document_id,
      document_r2_key,
      source_url,
      extraction_confidence,
      agent_event_id,
      fee_name,
      amount,
      frequency,
      conditions,
      outlier_flags,
      source
    )
    VALUES (
      ${institutionId},
      ${sourceDocumentId},
      ${null},
      ${options.row.source_url},
      ${options.candidate.confidence},
      ${agentEventId}::uuid,
      ${options.candidate.feeName},
      ${options.candidate.amount},
      ${options.candidate.frequency},
      ${conditions},
      ${JSON.stringify(flags)}::jsonb,
      'knox'
    )
    ON CONFLICT DO NOTHING
    RETURNING fee_raw_id
  `;
  return inserted.length > 0;
}

function institutionLabel(row: Pick<TextArtifactRow, "institution_id" | "institution_name">): string {
  return row.institution_name?.trim() || `Institution ${row.institution_id}`;
}

function rawObservationCountLabel(count: number): string {
  return `${count} raw observation${count === 1 ? "" : "s"}`;
}

function documentCountLabel(count: number): string {
  return `${count} normalized source document${count === 1 ? "" : "s"}`;
}

async function recordExtractionSignals(
  db: SqlTag,
  runId: number,
  results: KnoxExtractDocumentResult[],
  rowByDocumentTextId: Map<number, TextArtifactRow>,
): Promise<void> {
  const insertedGroups = new Map<number, {
    institutionName: string;
    sourceDocumentIds: number[];
    documentTextIds: number[];
    canonicalFeeKeys: string[];
    insertedObservationCount: number;
  }>();
  const needsReviewGroups = new Map<number, {
    institutionName: string;
    sourceDocumentIds: number[];
    documentTextIds: number[];
    reviewedDocumentCount: number;
  }>();

  results.forEach((result) => {
    const row = rowByDocumentTextId.get(result.documentTextId);
    const institutionName = row ? institutionLabel(row) : `Institution ${result.institutionId}`;

    if (result.inserted > 0) {
      const group = insertedGroups.get(result.institutionId) ?? {
        institutionName,
        sourceDocumentIds: [],
        documentTextIds: [],
        canonicalFeeKeys: [],
        insertedObservationCount: 0,
      };
      group.sourceDocumentIds.push(result.sourceDocumentId);
      group.documentTextIds.push(result.documentTextId);
      group.canonicalFeeKeys.push(...result.candidates.map((candidate) => candidate.canonicalHint));
      group.insertedObservationCount += result.inserted;
      insertedGroups.set(result.institutionId, group);
      return;
    }

    if (result.extracted === 0) {
      const group = needsReviewGroups.get(result.institutionId) ?? {
        institutionName,
        sourceDocumentIds: [],
        documentTextIds: [],
        reviewedDocumentCount: 0,
      };
      group.sourceDocumentIds.push(result.sourceDocumentId);
      group.documentTextIds.push(result.documentTextId);
      group.reviewedDocumentCount += 1;
      needsReviewGroups.set(result.institutionId, group);
    }
  });

  for (const [institutionId, group] of insertedGroups) {
    const count = group.insertedObservationCount;
    await recordHamiltonMonitorSignal(
      {
        institutionId,
        signalType: "knox_extraction_completed",
        severity: "medium",
        title: `${group.institutionName} - ${rawObservationCountLabel(count)} extracted`,
        body:
          `Knox extracted ${rawObservationCountLabel(count)} from Rosetta-normalized source text. ` +
          "Darwin verification is still required before benchmark scoring or public-ready analysis changes.",
        sourceJson: {
          source: "knox_extraction",
          run_id: runId,
          pipeline_stage: "raw_observations_pending_verification",
          source_document_ids: Array.from(new Set(group.sourceDocumentIds)),
          document_text_ids: Array.from(new Set(group.documentTextIds)),
          canonical_fee_keys: Array.from(new Set(group.canonicalFeeKeys)),
          extracted_observation_count: count,
          provider_call_queued: false,
        },
      },
      db,
    ).catch((error) => {
      console.error("recordKnoxExtractionSignal failed:", error);
    });
  }

  for (const [institutionId, group] of needsReviewGroups) {
    const count = group.reviewedDocumentCount;
    await recordHamiltonMonitorSignal(
      {
        institutionId,
        signalType: "knox_extraction_needs_review",
        severity: "medium",
        title: `${group.institutionName} - source text needs manual fee review`,
        body:
          `Knox found no source-grounded fee candidates in ${documentCountLabel(count)}. ` +
          "Review the source quality before relying on institution-specific fee conclusions.",
        sourceJson: {
          source: "knox_extraction",
          run_id: runId,
          pipeline_stage: "extraction_needs_review",
          source_document_ids: Array.from(new Set(group.sourceDocumentIds)),
          document_text_ids: Array.from(new Set(group.documentTextIds)),
          reviewed_document_count: count,
          provider_call_queued: false,
        },
      },
      db,
    ).catch((error) => {
      console.error("recordKnoxExtractionReviewSignal failed:", error);
    });
  }
}

export async function runKnoxExtract(
  options: RunKnoxExtractOptions,
): Promise<RunKnoxExtractResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectTextArtifacts(db, limit, options.institutionId, options.stateCode);
  const rowByDocumentTextId = new Map(rows.map((row) => [Number(row.document_text_id), row]));

  const results: KnoxExtractDocumentResult[] = [];
  for (const row of rows) {
    const candidates = extractCandidatesFromText(row.normalized_text);
    let inserted = 0;
    if (!dryRun) {
      for (const candidate of candidates) {
        if (await insertCandidate(db, { runId: options.runId, row, candidate })) inserted += 1;
      }
    }
    results.push({
      documentTextId: Number(row.document_text_id),
      sourceDocumentId: Number(row.source_document_id),
      institutionId: Number(row.institution_id),
      sourceUrl: row.source_url,
      extracted: candidates.length,
      inserted: dryRun ? 0 : inserted,
      skipped: dryRun ? candidates.length : candidates.length - inserted,
      candidates,
    });
  }

  if (!dryRun) {
    await recordExtractionSignals(db, options.runId, results, rowByDocumentTextId);
  }

  return {
    selectedDocuments: rows.length,
    processedDocuments: results.length,
    extractedFees: results.reduce((total, result) => total + result.extracted, 0),
    insertedFees: results.reduce((total, result) => total + result.inserted, 0),
    skippedFees: results.reduce((total, result) => total + result.skipped, 0),
    limit,
    dryRun,
    results,
  };
}

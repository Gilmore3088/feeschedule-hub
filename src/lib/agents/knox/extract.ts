import { createHash } from "crypto";

import { sql } from "@/lib/crawler-db/connection";
import { CANONICAL_KEY_MAP } from "@/lib/fee-taxonomy";

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
  crawl_result_id: number | string;
  crawl_target_id: number | string;
  source_url: string | null;
  normalized_text: string;
  text_hash: string | null;
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
  crawlResultId: number;
  crawlTargetId: number;
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

interface FeePattern {
  key: string;
  pattern: RegExp;
}

const FEE_PATTERNS: FeePattern[] = [
  { key: "monthly_maintenance", pattern: /\b(monthly|maintenance|service charge|account service)\b/i },
  { key: "minimum_balance", pattern: /\bminimum balance\b/i },
  { key: "overdraft", pattern: /\boverdraft\b/i },
  { key: "nsf", pattern: /\b(NSF|non[-\s]?sufficient|insufficient funds|returned item)\b/i },
  { key: "continuous_od", pattern: /\b(continuous|sustained|extended).{0,30}\boverdraft\b/i },
  { key: "od_protection_transfer", pattern: /\b(overdraft protection|OD protection).{0,40}\btransfer\b/i },
  { key: "atm_international", pattern: /\b(international|foreign).{0,30}\bATM\b/i },
  { key: "atm_non_network", pattern: /\b(ATM|non[-\s]?network|foreign ATM|out[-\s]?of[-\s]?network)\b/i },
  { key: "card_foreign_txn", pattern: /\b(foreign transaction|international transaction)\b/i },
  { key: "rush_card", pattern: /\b(rush|expedited).{0,30}\b(card|debit)\b/i },
  { key: "card_replacement", pattern: /\b(replacement|replace).{0,30}\b(card|debit|PIN)\b/i },
  { key: "wire_intl_outgoing", pattern: /\b(international|foreign).{0,40}\b(outgoing|send|sent).{0,40}\bwire\b/i },
  { key: "wire_intl_incoming", pattern: /\b(international|foreign).{0,40}\b(incoming|receive|received).{0,40}\bwire\b/i },
  { key: "wire_domestic_outgoing", pattern: /\b(domestic)?\s*(outgoing|send|sent).{0,40}\bwire\b/i },
  { key: "wire_domestic_incoming", pattern: /\b(domestic)?\s*(incoming|receive|received).{0,40}\bwire\b/i },
  { key: "cashiers_check", pattern: /\b(cashier'?s check|official check|certified check)\b/i },
  { key: "money_order", pattern: /\bmoney order\b/i },
  { key: "stop_payment", pattern: /\bstop payment\b/i },
  { key: "check_printing", pattern: /\b(check printing|checks order|order checks)\b/i },
  { key: "check_image", pattern: /\b(check image|check copy|copy of check)\b/i },
  { key: "check_cashing", pattern: /\bcheck cashing\b/i },
  { key: "paper_statement", pattern: /\b(paper statement|statement copy|mailed statement)\b/i },
  { key: "estatement_fee", pattern: /\be[-\s]?statement\b/i },
  { key: "ach_return", pattern: /\bACH.{0,30}\b(return|returned)\b/i },
  { key: "ach_origination", pattern: /\bACH.{0,30}\b(origination|batch)\b/i },
  { key: "bill_pay", pattern: /\bbill pay\b/i },
  { key: "mobile_deposit", pattern: /\bmobile deposit\b/i },
  { key: "deposited_item_return", pattern: /\b(deposited item return|returned deposited item|chargeback)\b/i },
  { key: "coin_counting", pattern: /\bcoin (counting|processing)\b/i },
  { key: "cash_advance", pattern: /\bcash advance\b/i },
  { key: "night_deposit", pattern: /\bnight deposit\b/i },
  { key: "notary_fee", pattern: /\bnotary\b/i },
  { key: "safe_deposit_box", pattern: /\b(safe deposit|lock box|lost key|drill)\b/i },
  { key: "garnishment_levy", pattern: /\b(garnishment|levy)\b/i },
  { key: "legal_process", pattern: /\b(legal process|subpoena|court order|lien release)\b/i },
  { key: "account_verification", pattern: /\baccount verification\b/i },
  { key: "balance_inquiry", pattern: /\bbalance inquiry\b/i },
  { key: "late_payment", pattern: /\blate (payment|charge|fee)\b/i },
  { key: "loan_origination", pattern: /\bloan (origination|processing|extension|modification)\b/i },
  { key: "appraisal_fee", pattern: /\bappraisal\b/i },
  { key: "ira_administration", pattern: /\bIRA.{0,30}\b(administration|annual|maintenance)\b/i },
  { key: "ira_termination", pattern: /\bIRA.{0,30}\b(termination|closing|closure)\b/i },
  { key: "gift_card_purchase", pattern: /\bgift card\b/i },
  { key: "prepaid_card_reload", pattern: /\b(prepaid|reload).{0,30}\bcard\b/i },
  { key: "early_closure", pattern: /\b(early account closure|closed within|early closing)\b/i },
  { key: "dormant_account", pattern: /\b(dormant|inactive|escheat)\b/i },
  { key: "account_research", pattern: /\b(account research|research fee|reconciliation|account balancing)\b/i },
];

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

function classifySegment(segment: string): string | null {
  const match = FEE_PATTERNS.find((entry) => entry.pattern.test(segment));
  if (!match) return null;
  return CANONICAL_KEY_MAP[match.key] ?? null;
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
): Promise<TextArtifactRow[]> {
  const targetFilter = institutionId ? "AND adt.crawl_target_id = $2" : "";
  const params = institutionId ? [limit, institutionId] : [limit];
  return db.unsafe<TextArtifactRow[]>(
    `
      SELECT adt.id AS document_text_id,
             adt.crawl_result_id,
             adt.crawl_target_id,
             adt.source_url,
             adt.normalized_text,
             adt.text_hash
        FROM agent_document_texts adt
       WHERE adt.status = 'completed'
         AND adt.normalized_text IS NOT NULL
         AND adt.char_count > 0
         ${targetFilter}
         AND NOT EXISTS (
           SELECT 1
             FROM fees_raw fr
            WHERE fr.source = 'knox'
              AND fr.crawl_event_id = adt.crawl_result_id
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
  const crawlResultId = Number(options.row.crawl_result_id);
  const crawlTargetId = Number(options.row.crawl_target_id);
  const agentEventId = stableUuid(
    `knox:${options.runId}:${documentTextId}:${crawlResultId}:${options.candidate.canonicalHint}:${options.candidate.feeName}:${options.candidate.amount}`,
  );
  const flags = ["needs_darwin_verification", `canonical_hint:${options.candidate.canonicalHint}`];
  const conditions =
    `Knox deterministic extraction from Rosetta artifact #${documentTextId}. ` +
    `canonical_hint=${options.candidate.canonicalHint}; text_hash=${options.row.text_hash ?? "unknown"}; ` +
    `excerpt="${options.candidate.excerpt.slice(0, 180)}"`;
  const inserted = await db`
    INSERT INTO fees_raw (
      institution_id,
      crawl_event_id,
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
      ${crawlTargetId},
      ${crawlResultId},
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

export async function runKnoxExtract(
  options: RunKnoxExtractOptions,
): Promise<RunKnoxExtractResult> {
  const db = options.db ?? sql;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectTextArtifacts(db, limit, options.institutionId);

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
      crawlResultId: Number(row.crawl_result_id),
      crawlTargetId: Number(row.crawl_target_id),
      sourceUrl: row.source_url,
      extracted: candidates.length,
      inserted: dryRun ? 0 : inserted,
      skipped: dryRun ? candidates.length : candidates.length - inserted,
      candidates,
    });
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

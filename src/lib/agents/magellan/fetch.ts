import { createHash } from "crypto";

import { sql } from "@/lib/data-store/connection";

type SqlTag = typeof sql;
type Fetcher = typeof fetch;

export const MAGELLAN_FETCH_DEFAULT_LIMIT = 25;
export const MAGELLAN_FETCH_MAX_LIMIT = 50;

const USER_AGENT = "AiBI-Magellan/1.0 (+https://theaibankinginstitute.com)";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

interface FetchCandidateRow {
  id: number | string;
  institution_name: string;
  fee_schedule_url: string | null;
  last_crawl_at: string | Date | null;
  consecutive_failures: number | string | null;
}

type FetchOutcome = "success" | "failed" | "skipped";

interface FetchResult {
  institutionId: number;
  institutionName: string;
  outcome: FetchOutcome;
  sourceUrl: string | null;
  finalUrl: string | null;
  statusCode: number | null;
  contentType: string | null;
  documentType: string | null;
  contentHash: string | null;
  bytes: number;
  reason: string | null;
}

export interface RunMagellanFetchOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  dryRun?: boolean;
  db?: SqlTag;
  fetchImpl?: Fetcher;
}

export interface RunMagellanFetchResult {
  selected: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  bytes: number;
  limit: number;
  dryRun: boolean;
  results: FetchResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MAGELLAN_FETCH_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAGELLAN_FETCH_MAX_LIMIT);
}

function normalizeHttpUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function detectDocumentType(url: string, contentType: string | null): string {
  const lowerType = contentType?.toLowerCase() ?? "";
  const lowerUrl = url.toLowerCase();
  if (lowerType.includes("application/pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerType.includes("text/html")) return "html";
  if (lowerType.includes("text/plain")) return "text";
  return "unknown";
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchWithTimeout(fetchImpl: Fetcher, url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCandidate(
  row: FetchCandidateRow,
  fetchImpl: Fetcher,
): Promise<FetchResult> {
  const institutionId = Number(row.id);
  const institutionName = String(row.institution_name);
  const sourceUrl = normalizeHttpUrl(row.fee_schedule_url);
  if (!sourceUrl) {
    return {
      institutionId,
      institutionName,
      outcome: "skipped",
      sourceUrl: row.fee_schedule_url,
      finalUrl: null,
      statusCode: null,
      contentType: null,
      documentType: null,
      contentHash: null,
      bytes: 0,
      reason: "Invalid or missing fee_schedule_url",
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, sourceUrl);
  } catch (error) {
    return {
      institutionId,
      institutionName,
      outcome: "failed",
      sourceUrl,
      finalUrl: null,
      statusCode: null,
      contentType: null,
      documentType: null,
      contentHash: null,
      bytes: 0,
      reason: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const finalUrl = response.url || sourceUrl;
  const contentType = response.headers.get("content-type");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOCUMENT_BYTES) {
    return {
      institutionId,
      institutionName,
      outcome: "failed",
      sourceUrl,
      finalUrl,
      statusCode: response.status,
      contentType,
      documentType: detectDocumentType(finalUrl, contentType),
      contentHash: null,
      bytes: 0,
      reason: `Document too large: ${contentLength} bytes`,
    };
  }

  if (!response.ok) {
    return {
      institutionId,
      institutionName,
      outcome: "failed",
      sourceUrl,
      finalUrl,
      statusCode: response.status,
      contentType,
      documentType: detectDocumentType(finalUrl, contentType),
      contentHash: null,
      bytes: 0,
      reason: `HTTP ${response.status}`,
    };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    return {
      institutionId,
      institutionName,
      outcome: "failed",
      sourceUrl,
      finalUrl,
      statusCode: response.status,
      contentType,
      documentType: detectDocumentType(finalUrl, contentType),
      contentHash: null,
      bytes: buffer.byteLength,
      reason: `Document too large: ${buffer.byteLength} bytes`,
    };
  }

  const bytes = new Uint8Array(buffer);
  return {
    institutionId,
    institutionName,
    outcome: "success",
    sourceUrl,
    finalUrl,
    statusCode: response.status,
    contentType,
    documentType: detectDocumentType(finalUrl, contentType),
    contentHash: sha256(bytes),
    bytes: bytes.byteLength,
    reason: null,
  };
}

async function selectCandidates(
  db: SqlTag,
  limit: number,
  institutionId?: number,
): Promise<FetchCandidateRow[]> {
  if (institutionId) {
    return db<FetchCandidateRow[]>`
      SELECT id, institution_name, fee_schedule_url, last_crawl_at, consecutive_failures
        FROM crawl_targets
       WHERE id = ${institutionId}
         AND COALESCE(status, 'active') = 'active'
       LIMIT 1
    `;
  }

  return db<FetchCandidateRow[]>`
    SELECT id, institution_name, fee_schedule_url, last_crawl_at, consecutive_failures
      FROM crawl_targets
     WHERE COALESCE(status, 'active') = 'active'
       AND fee_schedule_url IS NOT NULL
       AND btrim(fee_schedule_url) <> ''
       AND (
         last_crawl_at IS NULL
         OR last_crawl_at < NOW() - INTERVAL '12 hours'
         OR consecutive_failures > 0
       )
     ORDER BY
       CASE WHEN last_crawl_at IS NULL THEN 0 ELSE 1 END,
       consecutive_failures DESC,
       last_crawl_at ASC NULLS FIRST,
       id ASC
     LIMIT ${limit}
  `;
}

async function recordFetchResult(db: SqlTag, result: FetchResult): Promise<void> {
  const crawlStatus = result.outcome === "success" ? "success" : "failed";
  await db`
    INSERT INTO crawl_results
      (crawl_target_id, status, document_url, document_path, content_hash,
       fees_extracted, error_message, crawled_at, status_code)
    VALUES
      (${result.institutionId}, ${crawlStatus}, ${result.finalUrl ?? result.sourceUrl},
       NULL, ${result.contentHash}, 0, ${result.reason}, NOW(), ${result.statusCode})
  `;

  if (result.outcome === "success") {
    await db`
      UPDATE crawl_targets
         SET last_crawl_at = NOW(),
             last_success_at = NOW(),
             consecutive_failures = 0,
             last_content_hash = ${result.contentHash},
             document_type = ${result.documentType},
             document_type_detected = ${result.documentType},
             failure_reason = NULL,
             failure_reason_note = NULL,
             failure_reason_updated_at = failure_reason_updated_at
       WHERE id = ${result.institutionId}
    `;
    return;
  }

  await db`
    UPDATE crawl_targets
       SET last_crawl_at = NOW(),
           consecutive_failures = COALESCE(consecutive_failures, 0) + 1,
           failure_reason = 'agentic_fetch_failed',
           failure_reason_note = ${result.reason},
           failure_reason_updated_at = NOW()
     WHERE id = ${result.institutionId}
  `;
}

export async function runMagellanFetch(
  options: RunMagellanFetchOptions,
): Promise<RunMagellanFetchResult> {
  const db = options.db ?? sql;
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectCandidates(db, limit, options.institutionId);

  const results: FetchResult[] = [];
  for (const row of rows) {
    const result = await fetchCandidate(row, fetchImpl);
    results.push(result);
    if (!dryRun) await recordFetchResult(db, result);
  }

  return {
    selected: rows.length,
    processed: results.length,
    succeeded: results.filter((result) => result.outcome === "success").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    skipped: results.filter((result) => result.outcome === "skipped").length,
    bytes: results.reduce((total, result) => total + result.bytes, 0),
    limit,
    dryRun,
    results,
  };
}

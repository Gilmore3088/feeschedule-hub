import { sql } from "@/lib/data-store/connection";
import { LINK_UNAVAILABLE_STATUS_THRESHOLD } from "@/lib/link-health";
import { normalizeHttpUrl, USER_AGENT } from "./fetch";

type SqlTag = typeof sql;
type Fetcher = typeof fetch;

export const MAGELLAN_LINK_CHECK_DEFAULT_LIMIT = 50;
export const MAGELLAN_LINK_CHECK_MAX_LIMIT = 200;

const REQUEST_TIMEOUT_MS = 10_000;
export const MAGELLAN_LINK_CHECK_DEFAULT_MAX_DURATION_MS = 60_000;

/** HEAD statuses some servers return for HEAD specifically (or "not implemented") — worth one ranged-GET retry before giving up. */
const RETRYABLE_HEAD_STATUSES = new Set([403, 405, 501]);

interface LinkCheckCandidateRow {
  id: number | string;
  institution_id: number | string;
  document_url: string | null;
}

type LinkCheckOutcome = "checked" | "failed" | "skipped";

export interface LinkCheckResult {
  sourceDocumentId: number;
  institutionId: number;
  url: string | null;
  outcome: LinkCheckOutcome;
  statusCode: number | null;
  reason: string | null;
  /** True when the initial HEAD was inconclusive (403/405/501/network error) and a ranged GET retry ran. */
  retried: boolean;
}

export interface RunLinkCheckOptions {
  limit?: number;
  /** Wall-clock budget for this call; once exceeded, remaining candidates are left unchecked for the next run. */
  maxDurationMs?: number;
  db?: SqlTag;
  fetchImpl?: Fetcher;
}

export interface RunLinkCheckResult {
  selected: number;
  processed: number;
  checked: number;
  unavailable: number;
  failed: number;
  skipped: number;
  /** Selected candidates left unprocessed because the wall-clock budget ran out. */
  remaining: number;
  stoppedEarly: boolean;
  limit: number;
  results: LinkCheckResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MAGELLAN_LINK_CHECK_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAGELLAN_LINK_CHECK_MAX_LIMIT);
}

/**
 * Documents backing at least one approved published fee, oldest-checked
 * first, so a bounded batch always makes forward progress across the
 * backlog instead of re-checking the same institutions every run.
 */
async function selectLinkCheckCandidates(
  db: SqlTag,
  limit: number,
): Promise<LinkCheckCandidateRow[]> {
  return db<LinkCheckCandidateRow[]>`
    SELECT sd.id, sd.institution_id, sd.document_url
      FROM source_documents sd
     WHERE sd.document_url IS NOT NULL
       AND btrim(sd.document_url) <> ''
       AND EXISTS (
         SELECT 1
           FROM published_fee_catalog pfc
          WHERE pfc.source_document_id = sd.id
            AND pfc.review_status = 'approved'
       )
     ORDER BY sd.last_checked_at ASC NULLS FIRST, sd.id ASC
     LIMIT ${limit}
  `;
}

async function recordLinkCheckResult(
  db: SqlTag,
  sourceDocumentId: number,
  status: number | null,
): Promise<void> {
  await db`
    UPDATE source_documents
       SET last_checked_at = NOW(),
           last_status = ${status}
     WHERE id = ${sourceDocumentId}
  `;
}

async function requestWithTimeout(
  fetchImpl: Fetcher,
  url: string,
  init: { method: "HEAD" | "GET"; headers?: Record<string, string> },
): Promise<{ status: number | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: init.method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        ...init.headers,
      },
    });
    return { status: response.status, error: null };
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * HEAD-checks a URL; some servers reject/misbehave on HEAD specifically
 * (403/405/501) or the HEAD itself errors, so one ranged GET retry
 * (`Range: bytes=0-0`, fetching effectively nothing) runs before recording
 * a final status — avoids flagging a live link "unavailable" just because
 * the server doesn't support HEAD.
 */
async function checkUrl(
  fetchImpl: Fetcher,
  url: string,
): Promise<{ status: number | null; error: string | null; retried: boolean }> {
  const headResult = await requestWithTimeout(fetchImpl, url, { method: "HEAD" });
  const shouldRetry = headResult.status === null || RETRYABLE_HEAD_STATUSES.has(headResult.status);
  if (!shouldRetry) return { ...headResult, retried: false };

  const getResult = await requestWithTimeout(fetchImpl, url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  });
  return { ...getResult, retried: true };
}

/**
 * Magellan's link-check step: HEAD-checks (with a ranged-GET fallback) the
 * source documents backing published fees so the public profile can flag
 * "link currently unavailable" instead of silently linking to a dead page.
 * Runs outside a DB transaction (see run-store.ts's network-step allowlist)
 * so a batch of slow or timing-out requests never holds a connection/
 * transaction open — each candidate's DB write commits independently, so a
 * wall-clock-budget early stop still keeps everything checked so far. Do
 * not point this at production URLs from a dev/test session — only ever
 * exercise it against a mocked `fetchImpl` outside a deployed run.
 */
export async function runLinkCheck(
  runId: number,
  options: RunLinkCheckOptions = {},
): Promise<RunLinkCheckResult> {
  void runId; // kept for signature/audit parity with other Magellan steps
  const db = options.db ?? sql;
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = boundedLimit(options.limit);
  const maxDurationMs = options.maxDurationMs ?? MAGELLAN_LINK_CHECK_DEFAULT_MAX_DURATION_MS;
  const startedAt = Date.now();

  const rows = await selectLinkCheckCandidates(db, limit);

  const results: LinkCheckResult[] = [];
  let stoppedEarly = false;

  for (const row of rows) {
    if (Date.now() - startedAt >= maxDurationMs) {
      stoppedEarly = true;
      break;
    }

    const sourceDocumentId = Number(row.id);
    const institutionId = Number(row.institution_id);
    const url = normalizeHttpUrl(row.document_url);

    if (!url) {
      results.push({
        sourceDocumentId,
        institutionId,
        url: null,
        outcome: "skipped",
        statusCode: null,
        reason: "Missing or non-HTTP document URL",
        retried: false,
      });
      continue;
    }

    const { status, error, retried } = await checkUrl(fetchImpl, url);
    await recordLinkCheckResult(db, sourceDocumentId, status);
    results.push({
      sourceDocumentId,
      institutionId,
      url,
      outcome: status !== null ? "checked" : "failed",
      statusCode: status,
      reason: error,
      retried,
    });
  }

  return {
    selected: rows.length,
    processed: results.length,
    checked: results.filter(
      (result) => result.outcome === "checked" && (result.statusCode ?? 0) < LINK_UNAVAILABLE_STATUS_THRESHOLD,
    ).length,
    unavailable: results.filter(
      (result) => result.outcome === "checked" && (result.statusCode ?? 0) >= LINK_UNAVAILABLE_STATUS_THRESHOLD,
    ).length,
    failed: results.filter((result) => result.outcome === "failed").length,
    skipped: results.filter((result) => result.outcome === "skipped").length,
    remaining: rows.length - results.length,
    stoppedEarly,
    limit,
    results,
  };
}

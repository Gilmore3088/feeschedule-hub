import { sql } from "@/lib/data-store/connection";

type SqlTag = typeof sql;
type Fetcher = typeof fetch;

export const MAGELLAN_LINK_CHECK_DEFAULT_LIMIT = 200;
export const MAGELLAN_LINK_CHECK_MAX_LIMIT = 500;

const REQUEST_TIMEOUT_MS = 10_000;
/** HTTP status at or above which a fee's source link is reported unavailable on the public profile. */
export const LINK_UNAVAILABLE_STATUS_THRESHOLD = 400;

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
}

export interface RunLinkCheckOptions {
  limit?: number;
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

async function headCheckUrl(
  fetchImpl: Fetcher,
  url: string,
): Promise<{ status: number | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
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
 * Magellan's link-check step: HEAD-checks the source documents backing
 * published fees so the public profile can flag "link currently
 * unavailable" instead of silently linking to a dead page. Runs outside a
 * DB transaction (see run-store.ts's network-step allowlist) so a batch of
 * slow or timing-out HEAD requests never holds a connection/transaction
 * open. Do not point this at production URLs from a dev/test session —
 * only ever exercise it against a mocked `fetchImpl` outside a deployed run.
 */
export async function runLinkCheck(
  runId: number,
  options: RunLinkCheckOptions = {},
): Promise<RunLinkCheckResult> {
  void runId; // kept for signature/audit parity with other Magellan steps
  const db = options.db ?? sql;
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = boundedLimit(options.limit);

  const rows = await selectLinkCheckCandidates(db, limit);

  const results: LinkCheckResult[] = [];
  for (const row of rows) {
    const sourceDocumentId = Number(row.id);
    const institutionId = Number(row.institution_id);
    const url = row.document_url;

    if (!url) {
      results.push({
        sourceDocumentId,
        institutionId,
        url: null,
        outcome: "skipped",
        statusCode: null,
        reason: "Missing document URL",
      });
      continue;
    }

    const { status, error } = await headCheckUrl(fetchImpl, url);
    await recordLinkCheckResult(db, sourceDocumentId, status);
    results.push({
      sourceDocumentId,
      institutionId,
      url,
      outcome: status !== null ? "checked" : "failed",
      statusCode: status,
      reason: error,
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
    limit,
    results,
  };
}

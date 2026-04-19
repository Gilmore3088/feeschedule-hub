import { sql } from "./connection";

export interface KnoxRejectionRow {
  message_id: string;
  created_at: string;
  correlation_id: string;
  fee_verified_id: number | null;
  reason: string | null;
  reason_category: string | null;
  confidence: number | null;
  payload: Record<string, unknown>;
  round_number: number;
  state: string;
  fee_name: string | null;
  amount: number | null;
  frequency: string | null;
  institution_id: number | null;
  institution_name: string | null;
  state_code: string | null;
  canonical_fee_key: string | null;
  review_decision: "confirm" | "override" | null;
  reviewed_at: string | null;
  reviewer_username: string | null;
}

export interface KnoxRejectionDetail extends KnoxRejectionRow {
  source_url: string | null;
  extraction_confidence: number | null;
  document_r2_key: string | null;
  variant_type: string | null;
  fee_raw_id: number | null;
  fee_raw_conditions: string | null;
  fee_raw_name: string | null;
  fee_raw_amount: number | null;
  verified_by_agent_event_id: string | null;
  darwin_accept_message_id: string | null;
}

export interface KnoxReviewCounts {
  pending: number;
  confirmed: number;
  overridden: number;
  total: number;
}

type ReviewFilter = "pending" | "confirmed" | "overridden" | "all";

const REASON_CATEGORIES = [
  "outlier",
  "duplicate",
  "low_confidence",
  "schema_mismatch",
  "canonical_miss",
  "policy_violation",
  "other",
] as const;

export type KnoxReasonCategory = (typeof REASON_CATEGORIES)[number];

/**
 * Derive a coarse reason category from a free-text Knox rejection reason.
 * Knox currently stores reason as an arbitrary string in payload.reason;
 * this lookup lets the UI group the queue without requiring a schema change
 * on agent_messages.
 */
export function categorizeReason(reason: string | null): KnoxReasonCategory {
  if (!reason) return "other";
  const r = reason.toLowerCase();
  if (/(outlier|extreme|out of range|implausible)/.test(r)) return "outlier";
  if (/(duplicate|already|dedupe)/.test(r)) return "duplicate";
  if (/(confidence|low[-_ ]confidence|uncertain)/.test(r)) return "low_confidence";
  if (/(schema|shape|missing field|missing amount|malformed)/.test(r)) return "schema_mismatch";
  if (/(canonical|fee[_ ]key|taxonomy)/.test(r)) return "canonical_miss";
  if (/(policy|contract|governance|disallowed)/.test(r)) return "policy_violation";
  return "other";
}

export const KNOX_REASON_CATEGORIES: readonly KnoxReasonCategory[] = REASON_CATEGORIES;

// Per-instance TTL cache for the layout-level badge query.
//
// Every admin page render triggers a layout render, which called this on
// every request — wasteful at scale. 30-second TTL drops per-request DB
// hits to one per cache window per serverless instance.
//
// Caveats (documented per 2026-04-19 code-review MAJOR-3):
// - clearKnoxReviewCountsCache() only clears the invoking instance. Other
//   Vercel serverless instances surface stale badges until their own TTL
//   expires. This is BEST-EFFORT invalidation — cross-instance staleness
//   is bounded by the 30s TTL, not eliminated.
// - Promise-dedupe (_inFlight) collapses concurrent cold-cache requests
//   into a single DB call to avoid thundering-herd on first admin render.
const CACHE_TTL_MS = 30_000;
let _knoxCountsCache: { value: KnoxReviewCounts; expiresAt: number } | null = null;
let _inFlight: Promise<KnoxReviewCounts> | null = null;

export function clearKnoxReviewCountsCache(): void {
  _knoxCountsCache = null;
}

/**
 * Count Knox rejection messages grouped by human-review status.
 * - pending   : no knox_overrides row for this rejection_msg_id
 * - confirmed : knox_overrides.decision = 'confirm'
 * - overridden: knox_overrides.decision = 'override'
 *
 * Cached for 30s per instance (best-effort cross-instance invalidation).
 * Concurrent cold-cache callers share a single in-flight promise.
 */
export async function getKnoxReviewCounts(): Promise<KnoxReviewCounts> {
  const now = Date.now();
  if (_knoxCountsCache && _knoxCountsCache.expiresAt > now) {
    return _knoxCountsCache.value;
  }
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const rows = await sql<{ bucket: string; cnt: string }[]>`
        SELECT
          CASE
            WHEN ko.decision IS NULL THEN 'pending'
            WHEN ko.decision = 'confirm' THEN 'confirmed'
            WHEN ko.decision = 'override' THEN 'overridden'
            ELSE 'other'
          END AS bucket,
          COUNT(*) AS cnt
        FROM agent_messages am
        LEFT JOIN knox_overrides ko ON ko.rejection_msg_id = am.message_id
        WHERE am.sender_agent = 'knox' AND am.intent = 'reject'
        GROUP BY 1
      `;
      const counts: KnoxReviewCounts = {
        pending: 0,
        confirmed: 0,
        overridden: 0,
        total: 0,
      };
      for (const r of rows) {
        const n = Number(r.cnt);
        if (r.bucket === "pending") counts.pending = n;
        else if (r.bucket === "confirmed") counts.confirmed = n;
        else if (r.bucket === "overridden") counts.overridden = n;
        counts.total += n;
      }
      _knoxCountsCache = { value: counts, expiresAt: Date.now() + CACHE_TTL_MS };
      return counts;
    } finally {
      _inFlight = null;
    }
  })();
  try {
    return await _inFlight;
  } catch (e) {
    console.error("getKnoxReviewCounts failed:", e);
    return { pending: 0, confirmed: 0, overridden: 0, total: 0 };
  }
}

function reviewStatusClause(filter: ReviewFilter): string {
  switch (filter) {
    case "pending":
      return "ko.id IS NULL";
    case "confirmed":
      return "ko.decision = 'confirm'";
    case "overridden":
      return "ko.decision = 'override'";
    case "all":
    default:
      return "TRUE";
  }
}

const PAGE_SIZE = 25;

export interface ListKnoxRejectionsArgs {
  filter?: ReviewFilter;
  reasonCategory?: KnoxReasonCategory | "all";
  page?: number;
  pageSize?: number;
}

export interface ListKnoxRejectionsResult {
  rows: KnoxRejectionRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated list of Knox rejections for the review queue.
 *
 * JSON extraction:
 *   payload->>'reason'            — free-text rejection reason
 *   payload->>'confidence'        — numeric in 0..1 (optional)
 *   payload->>'fee_verified_id'   — BIGINT stringified
 */
export async function listKnoxRejections(
  args: ListKnoxRejectionsArgs = {}
): Promise<ListKnoxRejectionsResult> {
  const filter = args.filter ?? "pending";
  const reasonCategory = args.reasonCategory ?? "all";
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, args.pageSize ?? PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  try {
    const statusClause = reviewStatusClause(filter);

    // Get total (cheap because of index on sender_agent/intent/state/created_at).
    const countRows = await sql<{ cnt: string }[]>`
      SELECT COUNT(*) AS cnt
      FROM agent_messages am
      LEFT JOIN knox_overrides ko ON ko.rejection_msg_id = am.message_id
      WHERE am.sender_agent = 'knox'
        AND am.intent = 'reject'
        AND ${sql.unsafe(statusClause)}
    `;
    const total = Number(countRows[0]?.cnt ?? 0);

    const rows = await sql<KnoxRejectionRow[]>`
      SELECT
        am.message_id,
        am.created_at,
        am.correlation_id,
        NULLIF(am.payload->>'fee_verified_id','')::bigint AS fee_verified_id,
        am.payload->>'reason' AS reason,
        NULLIF(am.payload->>'confidence','')::numeric AS confidence,
        am.payload,
        am.round_number,
        am.state,
        fv.fee_name,
        fv.amount,
        fv.frequency,
        fv.institution_id,
        ct.institution_name,
        ct.state_code,
        fv.canonical_fee_key,
        ko.decision AS review_decision,
        ko.created_at AS reviewed_at,
        u.username AS reviewer_username,
        NULL::text AS reason_category
      FROM agent_messages am
      LEFT JOIN knox_overrides ko ON ko.rejection_msg_id = am.message_id
      LEFT JOIN users u ON u.id = ko.reviewer_id
      LEFT JOIN fees_verified fv
             ON fv.fee_verified_id = NULLIF(am.payload->>'fee_verified_id','')::bigint
      LEFT JOIN crawl_targets ct ON ct.id = fv.institution_id
      WHERE am.sender_agent = 'knox'
        AND am.intent = 'reject'
        AND ${sql.unsafe(statusClause)}
      ORDER BY am.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    // In-memory reason categorization + optional filter.
    const enriched = rows.map((r) => ({
      ...r,
      reason_category: categorizeReason(r.reason),
    }));
    const filtered =
      reasonCategory === "all"
        ? enriched
        : enriched.filter((r) => r.reason_category === reasonCategory);

    return { rows: filtered, total, page, pageSize };
  } catch (e) {
    console.error("listKnoxRejections failed:", e);
    return { rows: [], total: 0, page, pageSize };
  }
}

/**
 * Fetch a single rejection with full fee context for the detail page.
 */
export async function getKnoxRejectionById(
  messageId: string
): Promise<KnoxRejectionDetail | null> {
  try {
    const rows = await sql<KnoxRejectionDetail[]>`
      SELECT
        am.message_id,
        am.created_at,
        am.correlation_id,
        NULLIF(am.payload->>'fee_verified_id','')::bigint AS fee_verified_id,
        am.payload->>'reason' AS reason,
        NULLIF(am.payload->>'confidence','')::numeric AS confidence,
        am.payload,
        am.round_number,
        am.state,
        fv.fee_name,
        fv.amount,
        fv.frequency,
        fv.institution_id,
        ct.institution_name,
        ct.state_code,
        fv.canonical_fee_key,
        fv.source_url,
        fv.extraction_confidence,
        fv.document_r2_key,
        fv.variant_type,
        fv.fee_raw_id,
        fv.verified_by_agent_event_id,
        fr.conditions AS fee_raw_conditions,
        fr.fee_name   AS fee_raw_name,
        fr.amount     AS fee_raw_amount,
        ko.decision AS review_decision,
        ko.created_at AS reviewed_at,
        u.username AS reviewer_username,
        (
          SELECT am2.message_id::text
            FROM agent_messages am2
           WHERE am2.sender_agent = 'darwin'
             AND am2.intent = 'accept'
             AND am2.payload->>'fee_verified_id' = am.payload->>'fee_verified_id'
           ORDER BY am2.created_at DESC
           LIMIT 1
        ) AS darwin_accept_message_id,
        NULL::text AS reason_category
      FROM agent_messages am
      LEFT JOIN knox_overrides ko ON ko.rejection_msg_id = am.message_id
      LEFT JOIN users u ON u.id = ko.reviewer_id
      LEFT JOIN fees_verified fv
             ON fv.fee_verified_id = NULLIF(am.payload->>'fee_verified_id','')::bigint
      LEFT JOIN fees_raw fr ON fr.fee_raw_id = fv.fee_raw_id
      LEFT JOIN crawl_targets ct ON ct.id = fv.institution_id
      WHERE am.message_id = ${messageId}
        AND am.sender_agent = 'knox'
        AND am.intent = 'reject'
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { ...rows[0], reason_category: categorizeReason(rows[0].reason) };
  } catch (e) {
    console.error("getKnoxRejectionById failed:", e);
    return null;
  }
}

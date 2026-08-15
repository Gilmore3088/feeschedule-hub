import { sql } from "@/lib/data-store/connection";
import { safeJsonb, toISO } from "@/lib/pg-helpers";

type SqlTag = typeof sql;

export interface StateLaneMemorySyncResult {
  stateCode: string | null;
  lanesTouched: number;
  profilesTouched: number;
  backlogMissingUrls: number;
  backlogStaleSources: number;
  backlogOcr: number;
  backlogManualReview: number;
  failures: number;
  corrections: number;
}

export interface StateLaneHealth {
  stateCode: string;
  priorityScore: number;
  freshnessTargetHours: number;
  backlogMissingUrls: number;
  backlogStaleSources: number;
  backlogOcr: number;
  backlogManualReview: number;
  failures: number;
  corrections: number;
  lastAgentRunId: number | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAfter: string | null;
  profileCount: number;
  sourceKinds: {
    pdf: number;
    html: number;
    scannedPdf: number;
    unknown: number;
    offline: number;
  };
  readStrategies: {
    pdfText: number;
    htmlDom: number;
    browserRender: number;
    ocr: number;
    manualReview: number;
  };
  publicFindings: {
    unverified: number;
    verified: number;
    critical: number;
  };
}

export function normalizeStateCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : null;
}

function numberFrom(value: unknown): number {
  return Number(value ?? 0);
}

function isMissingStateLaneSchemaError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("agent_state_lanes") ||
    message.includes("institution_source_profiles") ||
    message.includes("institution_source_corrections") ||
    message.includes("does not exist") ||
    message.includes("undefined_table");
}

function emptySyncResult(stateCode: string | null): StateLaneMemorySyncResult {
  return {
    stateCode,
    lanesTouched: 0,
    profilesTouched: 0,
    backlogMissingUrls: 0,
    backlogStaleSources: 0,
    backlogOcr: 0,
    backlogManualReview: 0,
    failures: 0,
    corrections: 0,
  };
}

export function sourceKindFromDocumentType(value: string | null | undefined): "pdf" | "html" | "unknown" {
  if (value === "pdf") return "pdf";
  if (value === "html") return "html";
  return "unknown";
}

export function readStrategyFromDocumentType(value: string | null | undefined): "pdf_text" | "html_dom" | null {
  if (value === "pdf") return "pdf_text";
  if (value === "html" || value === "text") return "html_dom";
  return null;
}

export async function syncStateLaneProfiles(
  db: SqlTag = sql,
  stateCode?: string | null,
): Promise<StateLaneMemorySyncResult> {
  const normalizedState = normalizeStateCode(stateCode ?? null);

  try {
    const lanes = await db`
      INSERT INTO public.agent_state_lanes (state_code, next_run_after, created_at, updated_at)
      SELECT DISTINCT upper(btrim(state_code)), NOW(), NOW(), NOW()
        FROM public.institution_sources
       WHERE state_code IS NOT NULL
         AND btrim(state_code) <> ''
         AND (${normalizedState}::text IS NULL OR upper(btrim(state_code)) = ${normalizedState})
      ON CONFLICT (state_code) DO NOTHING
      RETURNING state_code
    `;

    const profiles = await db`
      INSERT INTO public.institution_source_profiles (
        institution_id,
        state_code,
        canonical_source_url,
        source_kind,
        read_strategy,
        last_source_hash,
        last_success_at,
        last_failure_at,
        last_failure_reason,
        consecutive_failures,
        created_at,
        updated_at
      )
      SELECT
        inst.id,
        upper(btrim(inst.state_code)),
        NULLIF(btrim(inst.fee_schedule_url), ''),
        CASE
          WHEN inst.document_type IN ('pdf', 'html') THEN inst.document_type
          WHEN inst.document_type IN ('offline', 'no_website') THEN 'offline'
          WHEN inst.fee_schedule_url ILIKE '%.pdf%' THEN 'pdf'
          WHEN inst.fee_schedule_url IS NOT NULL AND btrim(inst.fee_schedule_url) <> '' THEN 'unknown'
          ELSE 'unknown'
        END,
        CASE
          WHEN inst.document_type = 'pdf' OR inst.fee_schedule_url ILIKE '%.pdf%' THEN 'pdf_text'
          WHEN inst.document_type = 'html' THEN 'html_dom'
          WHEN inst.document_type IN ('offline', 'no_website') THEN 'manual_review'
          ELSE NULL
        END,
        inst.last_content_hash,
        inst.last_success_at,
        CASE WHEN inst.failure_reason IS NOT NULL THEN inst.failure_reason_updated_at ELSE NULL END,
        inst.failure_reason_note,
        COALESCE(inst.consecutive_failures, 0),
        NOW(),
        NOW()
      FROM public.institution_sources inst
      WHERE inst.state_code IS NOT NULL
        AND btrim(inst.state_code) <> ''
        AND (${normalizedState}::text IS NULL OR upper(btrim(inst.state_code)) = ${normalizedState})
      ON CONFLICT (institution_id) DO UPDATE SET
        state_code = EXCLUDED.state_code,
        canonical_source_url = CASE
          WHEN public.institution_source_profiles.locked_by_correction
            THEN public.institution_source_profiles.canonical_source_url
          ELSE COALESCE(public.institution_source_profiles.canonical_source_url, EXCLUDED.canonical_source_url)
        END,
        source_kind = CASE
          WHEN public.institution_source_profiles.locked_by_correction
            THEN public.institution_source_profiles.source_kind
          ELSE EXCLUDED.source_kind
        END,
        read_strategy = CASE
          WHEN public.institution_source_profiles.locked_by_correction
            THEN public.institution_source_profiles.read_strategy
          ELSE COALESCE(public.institution_source_profiles.read_strategy, EXCLUDED.read_strategy)
        END,
        updated_at = NOW()
      RETURNING institution_id
    `;

    await db`
    WITH lane_counts AS (
      SELECT
        upper(btrim(inst.state_code)) AS state_code,
        COUNT(*) FILTER (
          WHERE COALESCE(inst.status, 'active') = 'active'
            AND (inst.fee_schedule_url IS NULL OR btrim(inst.fee_schedule_url) = '')
            AND inst.website_url IS NOT NULL
            AND btrim(inst.website_url) <> ''
        )::int AS missing_urls,
        COUNT(*) FILTER (
          WHERE COALESCE(inst.status, 'active') = 'active'
            AND inst.fee_schedule_url IS NOT NULL
            AND btrim(inst.fee_schedule_url) <> ''
            AND (
              inst.last_crawl_at IS NULL
              OR inst.last_crawl_at < NOW() - INTERVAL '7 days'
            )
        )::int AS stale_sources,
        COUNT(*) FILTER (WHERE profile.read_strategy = 'ocr')::int AS ocr_backlog,
        COUNT(*) FILTER (
          WHERE profile.read_strategy = 'manual_review'
        )::int AS manual_backlog,
        COUNT(*) FILTER (
          WHERE COALESCE(profile.consecutive_failures, inst.consecutive_failures, 0) > 0
        )::int AS failures
      FROM public.institution_sources inst
      LEFT JOIN public.institution_source_profiles profile
        ON profile.institution_id = inst.id
      WHERE inst.state_code IS NOT NULL
        AND btrim(inst.state_code) <> ''
        AND (${normalizedState}::text IS NULL OR upper(btrim(inst.state_code)) = ${normalizedState})
      GROUP BY upper(btrim(inst.state_code))
    ),
    correction_counts AS (
      SELECT upper(btrim(inst.state_code)) AS state_code,
             COUNT(*)::int AS corrections
        FROM public.institution_source_corrections correction
        JOIN public.institution_sources inst ON inst.id = correction.institution_id
       WHERE inst.state_code IS NOT NULL
         AND btrim(inst.state_code) <> ''
         AND (${normalizedState}::text IS NULL OR upper(btrim(inst.state_code)) = ${normalizedState})
       GROUP BY upper(btrim(inst.state_code))
    )
    UPDATE public.agent_state_lanes lane
       SET backlog_missing_urls = lane_counts.missing_urls,
           backlog_stale_sources = lane_counts.stale_sources,
           backlog_ocr = lane_counts.ocr_backlog,
           backlog_manual_review = lane_counts.manual_backlog,
           failure_count = lane_counts.failures,
           correction_count = COALESCE(correction_counts.corrections, 0),
           updated_at = NOW()
      FROM lane_counts
      LEFT JOIN correction_counts ON correction_counts.state_code = lane_counts.state_code
     WHERE lane.state_code = lane_counts.state_code
    `;

    const [summary] = await db`
      SELECT
        COALESCE(SUM(backlog_missing_urls), 0)::int AS missing_urls,
        COALESCE(SUM(backlog_stale_sources), 0)::int AS stale_sources,
        COALESCE(SUM(backlog_ocr), 0)::int AS ocr_backlog,
        COALESCE(SUM(backlog_manual_review), 0)::int AS manual_backlog,
        COALESCE(SUM(failure_count), 0)::int AS failures,
        COALESCE(SUM(correction_count), 0)::int AS corrections
      FROM public.agent_state_lanes
      WHERE ${normalizedState}::text IS NULL OR state_code = ${normalizedState}
    `;

    return {
      stateCode: normalizedState,
      lanesTouched: lanes.length,
      profilesTouched: profiles.length,
      backlogMissingUrls: numberFrom(summary?.missing_urls),
      backlogStaleSources: numberFrom(summary?.stale_sources),
      backlogOcr: numberFrom(summary?.ocr_backlog),
      backlogManualReview: numberFrom(summary?.manual_backlog),
      failures: numberFrom(summary?.failures),
      corrections: numberFrom(summary?.corrections),
    };
  } catch (error) {
    if (isMissingStateLaneSchemaError(error)) return emptySyncResult(normalizedState);
    throw error;
  }
}

export async function getStateLaneHealth(
  stateCode: string,
  db: SqlTag = sql,
): Promise<StateLaneHealth | null> {
  const normalizedState = normalizeStateCode(stateCode);
  if (!normalizedState) return null;

  try {
    await syncStateLaneProfiles(db, normalizedState);
    const [row] = await db`
      WITH profile_counts AS (
        SELECT
          COUNT(*)::int AS profile_count,
          COUNT(*) FILTER (WHERE source_kind = 'pdf')::int AS pdf_sources,
          COUNT(*) FILTER (WHERE source_kind = 'html')::int AS html_sources,
          COUNT(*) FILTER (WHERE source_kind = 'scanned_pdf')::int AS scanned_pdf_sources,
          COUNT(*) FILTER (WHERE source_kind = 'unknown')::int AS unknown_sources,
          COUNT(*) FILTER (WHERE source_kind = 'offline')::int AS offline_sources,
          COUNT(*) FILTER (WHERE read_strategy = 'pdf_text')::int AS pdf_text_reads,
          COUNT(*) FILTER (WHERE read_strategy = 'html_dom')::int AS html_dom_reads,
          COUNT(*) FILTER (WHERE read_strategy = 'browser_render')::int AS browser_render_reads,
          COUNT(*) FILTER (WHERE read_strategy = 'ocr')::int AS ocr_reads,
          COUNT(*) FILTER (WHERE read_strategy = 'manual_review')::int AS manual_review_reads
        FROM public.institution_source_profiles
        WHERE state_code = ${normalizedState}
      ),
      finding_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE verified_status = 'unverified')::int AS unverified_findings,
          COUNT(*) FILTER (WHERE verified_status = 'verified')::int AS verified_findings,
          COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_findings
        FROM public.public_discovery_findings
        WHERE state_code = ${normalizedState}
      )
      SELECT
        lane.state_code,
        lane.priority_score,
        lane.freshness_target_hours,
        lane.backlog_missing_urls,
        lane.backlog_stale_sources,
        lane.backlog_ocr,
        lane.backlog_manual_review,
        lane.failure_count,
        lane.correction_count,
        lane.last_agent_run_id,
        lane.last_run_at,
        lane.last_success_at,
        lane.next_run_after,
        profile_counts.*,
        finding_counts.*
      FROM public.agent_state_lanes lane
      CROSS JOIN profile_counts
      CROSS JOIN finding_counts
      WHERE lane.state_code = ${normalizedState}
      LIMIT 1
    `;
    if (!row) return null;
    return {
      stateCode: String(row.state_code),
      priorityScore: numberFrom(row.priority_score),
      freshnessTargetHours: numberFrom(row.freshness_target_hours),
      backlogMissingUrls: numberFrom(row.backlog_missing_urls),
      backlogStaleSources: numberFrom(row.backlog_stale_sources),
      backlogOcr: numberFrom(row.backlog_ocr),
      backlogManualReview: numberFrom(row.backlog_manual_review),
      failures: numberFrom(row.failure_count),
      corrections: numberFrom(row.correction_count),
      lastAgentRunId: row.last_agent_run_id == null ? null : Number(row.last_agent_run_id),
      lastRunAt: toISO(row.last_run_at as string | Date | null),
      lastSuccessAt: toISO(row.last_success_at as string | Date | null),
      nextRunAfter: toISO(row.next_run_after as string | Date | null),
      profileCount: numberFrom(row.profile_count),
      sourceKinds: {
        pdf: numberFrom(row.pdf_sources),
        html: numberFrom(row.html_sources),
        scannedPdf: numberFrom(row.scanned_pdf_sources),
        unknown: numberFrom(row.unknown_sources),
        offline: numberFrom(row.offline_sources),
      },
      readStrategies: {
        pdfText: numberFrom(row.pdf_text_reads),
        htmlDom: numberFrom(row.html_dom_reads),
        browserRender: numberFrom(row.browser_render_reads),
        ocr: numberFrom(row.ocr_reads),
        manualReview: numberFrom(row.manual_review_reads),
      },
      publicFindings: {
        unverified: numberFrom(row.unverified_findings),
        verified: numberFrom(row.verified_findings),
        critical: numberFrom(row.critical_findings),
      },
    };
  } catch (error) {
    console.error("getStateLaneHealth failed:", error);
    return null;
  }
}

export function correctionAfterValue(value: unknown): Record<string, unknown> {
  const parsed = safeJsonb<Record<string, unknown>>(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

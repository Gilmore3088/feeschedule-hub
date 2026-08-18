/**
 * Hamilton Home / Executive Briefing — Server Data Fetcher
 * Assembles thesis + positioning data for the Home screen.
 * Per D-09: page uses ISR 24h revalidation to avoid repeated API calls.
 * Per D-11: signal/alert queries are NOT cached — fresh on every load.
 */

import { getNationalIndexCached } from "@/lib/data-store/fee-index";
import { getSpotlightCategories } from "@/lib/fee-taxonomy";
import { DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { sql } from "@/lib/data-store/connection";
import { generateGlobalThesis } from "./generate";
import type { ThesisOutput, ThesisSummaryPayload } from "./types";
import type { HamiltonEvidencePolicy } from "@/lib/hamilton/request-contract";

// ---------------------------------------------------------------------------
// Signal/alert types (Plan 02 additions)
// ---------------------------------------------------------------------------

export interface SignalEntry {
  id: string;
  institutionId?: string | null;
  signalType: string;
  severity: string;
  title: string;
  body: string;
  createdAt: string;
  evidencePolicy?: HamiltonEvidencePolicy | null;
  providerCallQueued?: boolean;
}

export interface AlertEntry {
  id: string;
  signalId: string;
  institutionId?: string | null;
  signalType: string;
  severity: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  evidencePolicy?: HamiltonEvidencePolicy | null;
  providerCallQueued?: boolean;
}

export interface HomeBriefingSignals {
  whatChanged: SignalEntry[];
  priorityAlerts: AlertEntry[];
  monitorFeed: SignalEntry[];
}

export interface PositioningEntry {
  feeCategory: string;
  displayName: string;
  medianAmount: number | null;
  p25Amount: number | null;
  p75Amount: number | null;
  institutionCount: number;
  maturityTier: "strong" | "provisional" | "insufficient";
}

/**
 * "current": thesis generated successfully this request.
 * "paused": Hamilton's automation control flag is off (e.g. provider credit
 *   exhausted) — a known, temporary condition, not a data/product failure.
 * "unavailable": thesis generation failed for any other reason.
 */
export type ThesisStatus = "current" | "paused" | "unavailable";

export interface HomeBriefingData {
  thesis: ThesisOutput | null;
  thesisStatus: ThesisStatus;
  confidence: "high" | "medium" | "low";
  positioning: PositioningEntry[];
  spotlightCount: number;
  totalInstitutions: number;
  recommendedCategory: string | null;
}

/** DB-only portion of the Home briefing — no provider calls, safe to cache. */
export interface HomeBriefingSummary {
  confidence: "high" | "medium" | "low";
  positioning: PositioningEntry[];
  spotlightCount: number;
  totalInstitutions: number;
  thesisSummaryPayload: ThesisSummaryPayload;
}

/** Provider-backed portion of the Home briefing — must NOT be cached for a
 * full day, or a maintenance-window failure gets memoized as a real outage. */
export interface HomeThesisResult {
  thesis: ThesisOutput | null;
  thesisStatus: ThesisStatus;
  recommendedCategory: string;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${year}`;
}

function deriveDisplayName(feeCategory: string): string {
  if (DISPLAY_NAMES[feeCategory]) {
    return DISPLAY_NAMES[feeCategory];
  }
  return feeCategory
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveConfidence(
  maturityTiers: Array<"strong" | "provisional" | "insufficient">
): "high" | "medium" | "low" {
  if (maturityTiers.some((t) => t === "insufficient")) {
    return "low";
  }
  if (maturityTiers.every((t) => t === "strong")) {
    return "high";
  }
  return "medium";
}

/**
 * Fetch the DB-backed numeric summary for the Home / Executive Briefing screen
 * (positioning, confidence, institution counts). No provider calls — safe to
 * cache for a full day (see hamilton/page.tsx's unstable_cache wrapper).
 */
export async function fetchHomeBriefingSummary(): Promise<HomeBriefingSummary> {
  // getNationalIndexCached hits the DB. During build-time ISR prerender (revalidate=86400)
  // the DB can be unreachable; degrade to an empty briefing — the page already renders an
  // "Analysis unavailable" state for null data — instead of crashing the build. Normal
  // request-time behavior (DB reachable) is unchanged.
  let allEntries: Awaited<ReturnType<typeof getNationalIndexCached>> = [];
  try {
    allEntries = await getNationalIndexCached();
  } catch {
    // DB unavailable at prerender — fall through with an empty briefing.
  }
  const spotlightCategories = getSpotlightCategories();

  // Build positioning entries for spotlight categories
  const positioning: PositioningEntry[] = spotlightCategories
    .map((category) => {
      const entry = allEntries.find((e) => e.fee_category === category);
      if (!entry) return null;
      return {
        feeCategory: category,
        displayName: deriveDisplayName(category),
        medianAmount: entry.median_amount,
        p25Amount: entry.p25_amount,
        p75Amount: entry.p75_amount,
        institutionCount: entry.institution_count,
        maturityTier: entry.maturity_tier,
      } satisfies PositioningEntry;
    })
    .filter((e): e is PositioningEntry => e !== null);

  // Derive confidence from spotlight maturity tiers
  const confidence = deriveConfidence(positioning.map((e) => e.maturityTier));

  // Compute total unique institutions from all entries
  const totalInstitutions = allEntries.reduce(
    (sum, e) => sum + e.institution_count,
    0
  );

  // Build minimal ThesisSummaryPayload — lighter scope, no heavy data sources
  const top10 = allEntries.slice(0, 10);
  const thesisSummaryPayload: ThesisSummaryPayload = {
    quarter: getCurrentQuarter(),
    total_institutions: totalInstitutions,
    top_categories: top10.map((e) => ({
      fee_category: e.fee_category,
      display_name: deriveDisplayName(e.fee_category),
      median_amount: e.median_amount,
      bank_median: null,
      cu_median: null,
      institution_count: e.institution_count,
      maturity_tier: e.maturity_tier,
    })),
    revenue_snapshot: null,
    fred_snapshot: null,
    beige_book_themes: [],
    derived_tensions: [],
  };

  return {
    confidence,
    positioning,
    spotlightCount: positioning.length,
    totalInstitutions,
    thesisSummaryPayload,
  };
}

/**
 * Generate the global thesis narrative for the Home screen. Calls the AI
 * provider (via generateGlobalThesis), so this must be invoked fresh per
 * request rather than memoized with a 24h cache — otherwise a maintenance
 * window (automation paused) gets cached as a real outage for a full day.
 * Returns thesis: null on failure so the page can render a status banner
 * instead of crashing; thesisStatus distinguishes a known pause (automation
 * control engaged) from any other failure.
 */
export async function fetchHomeThesis(
  thesisSummaryPayload: ThesisSummaryPayload,
): Promise<HomeThesisResult> {
  const spotlightCategories = getSpotlightCategories();

  let thesis: ThesisOutput | null = null;
  let thesisStatus: ThesisStatus = "unavailable";
  try {
    thesis = await generateGlobalThesis({ scope: "monthly_pulse", data: thesisSummaryPayload });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    let errorType: "missing_key" | "rate_limit" | "api_error" = "api_error";
    if (errorMessage.includes("API key") || errorMessage.includes("ANTHROPIC_API_KEY")) {
      errorType = "missing_key";
    } else if (errorMessage.includes("rate_limit") || errorMessage.includes("429")) {
      errorType = "rate_limit";
    }
    console.warn("[Hamilton] Thesis generation failed", {
      timestamp: new Date().toISOString(),
      errorType,
      scope: "monthly_pulse",
    });
    thesisStatus = /Emergency stop/i.test(errorMessage) ? "paused" : "unavailable";
    thesis = null;
  }

  // Derive recommendedCategory from thesis tensions (per D-07)
  let recommendedCategory: string | null = null;
  if (thesis) {
    const textToSearch = [
      thesis.core_thesis,
      ...(thesis.tensions ?? []).map((t) => `${t.implication ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();
    for (const cat of spotlightCategories) {
      if (textToSearch.includes(cat.replace(/_/g, " "))) {
        recommendedCategory = cat;
        break;
      }
    }
  }
  if (!recommendedCategory) {
    recommendedCategory = "overdraft";
  }

  return {
    thesis,
    thesisStatus: thesis ? "current" : thesisStatus,
    recommendedCategory,
  };
}

/**
 * Fetch all data needed for the Hamilton Home / Executive Briefing screen.
 * Convenience wrapper combining fetchHomeBriefingSummary + fetchHomeThesis.
 * Callers that need independent cache control over the DB summary vs. the
 * provider-backed thesis (per D-09) should call those two functions directly
 * instead — see hamilton/page.tsx.
 */
export async function fetchHomeBriefingData(): Promise<HomeBriefingData> {
  const summary = await fetchHomeBriefingSummary();
  const { thesis, thesisStatus, recommendedCategory } = await fetchHomeThesis(
    summary.thesisSummaryPayload,
  );

  return {
    thesis,
    thesisStatus,
    confidence: summary.confidence,
    positioning: summary.positioning,
    spotlightCount: summary.spotlightCount,
    totalInstitutions: summary.totalInstitutions,
    recommendedCategory,
  };
}

// ---------------------------------------------------------------------------
// Signal/alert query functions (fresh every load — NOT ISR cached, per D-11)
// ---------------------------------------------------------------------------

/**
 * Fetch recent signals from hamilton_signals ordered by created_at DESC.
 * Returns empty array on failure (table may not exist or have data per D-02).
 */
function normalizeHomeInstitutionScope(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || !/^[1-9]\d*$/.test(trimmed)) continue;
    seen.add(trimmed);
  }
  return [...seen];
}

async function fetchRecentSignals(
  limit: number,
  institutionIds: string[] = [],
): Promise<SignalEntry[]> {
  try {
    const scopedInstitutionIds = normalizeHomeInstitutionScope(institutionIds);
    const rows = scopedInstitutionIds.length > 0
      ? await sql`
          SELECT
            id,
            institution_id,
            signal_type,
            severity,
            title,
            body,
            created_at,
            source_json ->> 'evidence_policy' AS evidence_policy,
            COALESCE((source_json ->> 'provider_call_queued')::boolean, false) AS provider_call_queued
          FROM hamilton_signals
          WHERE institution_id = ANY(${scopedInstitutionIds}::text[])
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT
            id,
            institution_id,
            signal_type,
            severity,
            title,
            body,
            created_at,
            source_json ->> 'evidence_policy' AS evidence_policy,
            COALESCE((source_json ->> 'provider_call_queued')::boolean, false) AS provider_call_queued
          FROM hamilton_signals
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return rows.map((r) => ({
      id: String(r.id),
      institutionId: r.institution_id == null ? null : String(r.institution_id),
      signalType: String(r.signal_type),
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      createdAt: String(r.created_at),
      evidencePolicy: r.evidence_policy == null ? null : (String(r.evidence_policy) as HamiltonEvidencePolicy),
      providerCallQueued: r.provider_call_queued === true,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch active priority alerts for a user, joined with signal data.
 * Ordered by severity DESC then created_at DESC. Per T-42-04: user_id scoped.
 * Returns empty array on failure per D-03.
 */
async function fetchPriorityAlerts(
  userId: number,
  limit = 3,
  institutionIds: string[] = [],
): Promise<AlertEntry[]> {
  try {
    const scopedInstitutionIds = normalizeHomeInstitutionScope(institutionIds);
    const rows = scopedInstitutionIds.length > 0
      ? await sql`
          SELECT
            pa.id,
            pa.signal_id,
            pa.status,
            pa.created_at,
            s.institution_id,
            s.signal_type,
            s.severity,
            s.title,
            s.body,
            s.source_json ->> 'evidence_policy' AS evidence_policy,
            COALESCE((s.source_json ->> 'provider_call_queued')::boolean, false) AS provider_call_queued
          FROM hamilton_priority_alerts pa
          JOIN hamilton_signals s ON pa.signal_id = s.id
          WHERE pa.user_id = ${userId}
            AND pa.status = 'active'
            AND s.institution_id = ANY(${scopedInstitutionIds}::text[])
          ORDER BY
            CASE s.severity
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 3
              ELSE 4
            END ASC,
            pa.created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT
            pa.id,
            pa.signal_id,
            pa.status,
            pa.created_at,
            s.institution_id,
            s.signal_type,
            s.severity,
            s.title,
            s.body,
            s.source_json ->> 'evidence_policy' AS evidence_policy,
            COALESCE((s.source_json ->> 'provider_call_queued')::boolean, false) AS provider_call_queued
          FROM hamilton_priority_alerts pa
          JOIN hamilton_signals s ON pa.signal_id = s.id
          WHERE pa.user_id = ${userId}
            AND pa.status = 'active'
          ORDER BY
            CASE s.severity
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 3
              ELSE 4
            END ASC,
            pa.created_at DESC
          LIMIT ${limit}
        `;
    return rows.map((r) => ({
      id: String(r.id),
      signalId: String(r.signal_id),
      institutionId: r.institution_id == null ? null : String(r.institution_id),
      signalType: String(r.signal_type),
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      status: String(r.status),
      createdAt: String(r.created_at),
      evidencePolicy: r.evidence_policy == null ? null : (String(r.evidence_policy) as HamiltonEvidencePolicy),
      providerCallQueued: r.provider_call_queued === true,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch all signal/alert data for the Executive Briefing home screen.
 * Called fresh on every page load (NOT ISR cached, per D-11).
 * Parallel fetch for performance (T-42-06: LIMIT clauses prevent unbounded results).
 */
export async function fetchHomeBriefingSignals(
  userId: number,
  options: { institutionIds?: string[] } = {},
): Promise<HomeBriefingSignals> {
  const institutionIds = normalizeHomeInstitutionScope(options.institutionIds ?? []);
  const [recentFive, alerts, recentThree] = await Promise.all([
    fetchRecentSignals(5, institutionIds),
    fetchPriorityAlerts(userId, 3, institutionIds),
    fetchRecentSignals(3, institutionIds),
  ]);
  return {
    whatChanged: recentFive,
    priorityAlerts: alerts,
    monitorFeed: recentThree,
  };
}

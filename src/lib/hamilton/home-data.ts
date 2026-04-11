/**
 * Hamilton Home / Executive Briefing — Server Data Fetcher
 * Assembles thesis + positioning data for the Home screen.
 * Per D-09: page uses ISR 24h revalidation to avoid repeated API calls.
 * Per D-11: signal/alert queries are NOT cached — fresh on every load.
 */

import { getNationalIndexCached } from "@/lib/crawler-db/fee-index";
import { getSpotlightCategories } from "@/lib/fee-taxonomy";
import { DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { sql } from "@/lib/crawler-db/connection";
import { generateGlobalThesis } from "./generate";
import type { ThesisOutput, ThesisSummaryPayload } from "./types";

// ---------------------------------------------------------------------------
// Signal/alert types (Plan 02 additions)
// ---------------------------------------------------------------------------

export interface SignalEntry {
  id: string;
  signalType: string;
  severity: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AlertEntry {
  id: string;
  signalId: string;
  severity: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
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

export interface HomeBriefingData {
  thesis: ThesisOutput | null;
  confidence: "high" | "medium" | "low";
  positioning: PositioningEntry[];
  spotlightCount: number;
  totalInstitutions: number;
  recommendedCategory: string | null;
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
 * Fetch all data needed for the Hamilton Home / Executive Briefing screen.
 * Calls generateGlobalThesis() with a monthly_pulse scope — lighter than quarterly.
 * Returns thesis: null on API failure so page can render empty state gracefully.
 */
export async function fetchHomeBriefingData(): Promise<HomeBriefingData> {
  const allEntries = await getNationalIndexCached();
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
  const thesisSummary: ThesisSummaryPayload = {
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

  let thesis: ThesisOutput | null = null;
  try {
    thesis = await generateGlobalThesis({ scope: "monthly_pulse", data: thesisSummary });
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
    thesis = null;
  }

  // Derive recommendedCategory from thesis tensions (per D-07)
  // Note: spotlightCategories is already declared at the top of this function.
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
    confidence,
    positioning,
    spotlightCount: positioning.length,
    totalInstitutions,
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
async function fetchRecentSignals(limit: number): Promise<SignalEntry[]> {
  try {
    const rows = await sql`
      SELECT id, institution_id, signal_type, severity, title, body, created_at
      FROM hamilton_signals
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      signalType: String(r.signal_type),
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      createdAt: String(r.created_at),
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
  limit = 3
): Promise<AlertEntry[]> {
  try {
    const rows = await sql`
      SELECT
        pa.id,
        pa.signal_id,
        pa.status,
        pa.created_at,
        s.severity,
        s.title,
        s.body
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
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      status: String(r.status),
      createdAt: String(r.created_at),
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
  userId: number
): Promise<HomeBriefingSignals> {
  const [recentFive, alerts, recentThree] = await Promise.all([
    fetchRecentSignals(5),
    fetchPriorityAlerts(userId, 3),
    fetchRecentSignals(3),
  ]);
  return {
    whatChanged: recentFive,
    priorityAlerts: alerts,
    monitorFeed: recentThree,
  };
}

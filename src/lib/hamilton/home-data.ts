/**
 * Hamilton Home / Executive Briefing — Server Data Fetcher
 * Assembles thesis + positioning data for the Home screen.
 * Per D-09: page uses ISR 24h revalidation to avoid repeated API calls.
 */

import { getNationalIndexCached } from "@/lib/crawler-db/fee-index";
import { getSpotlightCategories } from "@/lib/fee-taxonomy";
import { DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { generateGlobalThesis } from "./generate";
import type { ThesisOutput, ThesisSummaryPayload } from "./types";

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
  } catch {
    // API unavailable or rate limited — return null for empty state
    thesis = null;
  }

  return {
    thesis,
    confidence,
    positioning,
    spotlightCount: positioning.length,
    totalInstitutions,
  };
}

"use server";

import { getCurrentUser } from "@/lib/auth";
import { getNationalIndex } from "@/lib/data-store/fee-index";
import {
  getFeesByInstitution,
  getFinancialsByInstitution,
  getInstitutionById,
} from "@/lib/data-store";
import { sql } from "@/lib/data-store/connection";
import {
  getInstitutionPeerRanking,
  getInstitutionRevenueTrend,
} from "@/lib/data-store/call-reports";
import { getInstitutionFeeScheduleEvidence } from "@/lib/data-store/institution";
import { generateSection } from "@/lib/hamilton/generate";
import {
  saveHamiltonReport,
  getRecentHamiltonReports,
  getActiveScenarios,
  getHamiltonReportById,
  getHamiltonScenarioById,
} from "@/lib/hamilton/pro-tables";
import { formatAssets, formatCompactDollars } from "@/lib/format";
import { getFeePublicationStatusLabel } from "@/lib/institution-quality";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

export type ReportTemplateType =
  | "peer_benchmarking"
  | "regional_landscape"
  | "category_deep_dive"
  | "competitive_positioning";

export interface GenerateReportParams {
  templateType: ReportTemplateType;
  dateFrom: string;
  dateTo: string;
  peerSetId?: string;
  scenarioId?: string;
  focusCategory?: string;
  institutionId?: number;
  selectedInstitutionName?: string;
  evidencePolicy?: "provisional-first" | string;
}

export type GenerateReportResult =
  | {
      success: true;
      reportId: string;
      report: ReportSummaryResponse;
    }
  | {
      success: false;
      error: string;
    };

const TEMPLATE_TITLES: Record<ReportTemplateType, string> = {
  peer_benchmarking: "Peer Benchmarking Report",
  regional_landscape: "Regional Fee Landscape",
  category_deep_dive: "Category Deep Dive",
  competitive_positioning: "Competitive Positioning",
};

function buildInsufficientEvidenceReport(params: {
  institutionName: string;
  period: string;
  statusLabel: string;
  verifiedCount: number;
  provisionalCount: number;
  assetSize: number | null;
  latestSourceStatus: string | null;
  latestFinancial: {
    report_date: string;
    total_assets: number | null;
    service_charge_income: number | null;
  } | null;
}): ReportSummaryResponse {
  const financialSummary = params.latestFinancial
    ? `Financial context is available through ${params.latestFinancial.report_date}: assets are ${formatCompactDollars(params.latestFinancial.total_assets)} and reported service charge income is ${formatCompactDollars(params.latestFinancial.service_charge_income)}.`
    : "Financial context is not available in the current dataset.";

  return {
    title: `Data Readiness Brief - ${params.institutionName}`,
    executiveSummary: [
      `${params.institutionName} is tracked, but Hamilton does not have verified or provisional fee rows sufficient for a competitive fee brief.`,
      financialSummary,
      "A consulting-grade brief should start with source acquisition and validation before drawing pricing, peer-positioning, or revenue conclusions.",
    ],
    snapshot: [
      {
        label: "Fee evidence",
        current: `${params.verifiedCount} verified / ${params.provisionalCount} provisional`,
        proposed: "Submit and validate official source",
      },
      {
        label: "Publication status",
        current: params.statusLabel,
        proposed: "Ready or directional",
      },
      {
        label: "Assets",
        current: params.assetSize ? formatAssets(params.assetSize) : "N/A",
        proposed: "Use for peer-set selection",
      },
    ],
    strategicRationale:
      `${params.institutionName} should not receive a generic competitive position when fee evidence is empty. ` +
      "The next high-value work is deterministic: confirm the official fee schedule, extract rows, label evidence tier and confidence, then rerun peer deltas once benchmark-eligible rows exist.",
    tradeoffs: [
      {
        label: "Use now",
        value: "Identity, asset tier, financial context, and source diligence",
      },
      {
        label: "Do not use yet",
        value: "Fee benchmark score, pricing recommendations, or peer fee deltas",
      },
      {
        label: "Next diligence",
        value: "Official fee schedule URL, account type coverage, effective date, and row-level source labels",
      },
    ],
    recommendation:
      "Submit the official fee schedule, validate source coverage, classify extracted rows, then rerun a competitive positioning report with provisional-first evidence labels. Until then, keep the output as a diligence brief.",
    implementationNotes: [
      `Analysis period requested: ${params.period}`,
      `Latest source status: ${params.latestSourceStatus ?? "no source record"}`,
      "No provider generation was used for this empty-evidence report.",
      "Verified benchmark conclusions must exclude provisional rows unless explicitly labeled otherwise.",
    ],
    exportControls: {
      pdfEnabled: true,
      shareEnabled: false,
    },
  };
}

/**
 * Build context string for the executive summary section by template type.
 * Each template type uses a different analytical lens.
 */
/**
 * Shared no-fluff rules. Same banned phrases + grounding requirements as
 * RECOMMENDATION_RULES. The model can be funny in its choice of how to
 * express things — but it cannot be vague, can't invent numbers, and can't
 * reach for consultancy-speak when it has nothing to say.
 */
const NO_FLUFF_RULES = `
HARD RULES — fail any, rewrite the section:
1. Cite a specific dollar value, percentile, or fee category from the DATA payload at least twice. If the data is thin, write a shorter section saying only what is known.
2. NEVER cite a percentage, dollar amount, growth rate, or institution count absent from the DATA payload. Invented sources like "industry studies show", "research indicates", or phantom ranges like "12-18%" are forbidden.
3. Banned phrases (corporate-speak with no specific meaning): "strategic void", "must establish leadership", "deploying systematic intelligence", "data-sophisticated rivals", "revenue leakage", "willingness-to-pay", "dual strategy", "create sustainable competitive advantage", "market intelligence superiority", "precision pricing", "competitive positioning superiority". Banned even ironically.
4. Write in the active voice. Say who does what. "Regions Bank raised overdraft to \$35" — not "overdraft was raised to \$35".
5. State claims in positive form. Prefer "X outpaces Y" over "X is not below Y". Prefer "declined" over "did not increase".
6. Use definite, specific, concrete language. Say "\$35 overdraft fee at Regions Bank (Q4 2025)" — not "elevated fee structures at large regional banks recently".
7. Cut needless words. "In order to" → "to". "Due to the fact that" → "because". "At this point in time" → "now". "A large number of" → "many". If a word adds nothing, delete it.
8. Plain banker English. Short sentences. When you name a number, name what it is a number OF.
9. Place the sharpest fact at the end of the sentence — the emphatic position. Not "Regions Bank raised overdraft to \$35, which is notable" but "Regions Bank raised overdraft to \$35".
10. If a sentence could appear unchanged in any other bank's report, delete it.
`.trim();

function buildExecutiveSummaryContext(
  params: GenerateReportParams,
  institutionName: string,
  period: string
): string {
  const head = (() => {
    switch (params.templateType) {
      case "peer_benchmarking":
        return `Compare ${institutionName}'s fees to peers using the categories in the DATA payload. Lead with the 1–2 categories where the gap is largest (above or below peer median). Cite dollar figures from the payload. Period: ${period}.`;
      case "regional_landscape":
        return `Describe the regional fee pattern visible in the DATA payload. Lead with the single most striking geographic difference (e.g. "FL CU NSF median is \$28; national CU median is \$26"). Period: ${period}.`;
      case "category_deep_dive": {
        const cat = params.focusCategory
          ? params.focusCategory.replace(/_/g, " ")
          : "the focus category";
        return `Summarize the ${cat} distribution at ${institutionName}'s peer set. Lead with the median, the P25–P75 spread, and the number of institutions observed. Period: ${period}.`;
      }
      case "competitive_positioning":
        return `Assess competitive position across the categories in the DATA payload. Lead with the 1–2 categories where ${institutionName} is most exposed (highest variance from peer median). Period: ${period}.`;
    }
  })();

  return `${head}\n\n${NO_FLUFF_RULES}`;
}

/**
 * Build context string for the strategic section by template type.
 */
function buildStrategicContext(
  params: GenerateReportParams,
  institutionName: string
): string {
  const head = (() => {
    switch (params.templateType) {
      case "peer_benchmarking":
        return `Explain WHY the peer gaps in the DATA payload exist for ${institutionName}. For each category in top_fees, cite the peer median + spread, then offer one observation about the gap (e.g. "P25 cluster at \$20 suggests overdraft-fee compression among CUs under \$5B"). Stop after 3 such observations.`;
      case "regional_landscape":
        return `Explain WHY the regional pattern in the DATA payload looks the way it does. Anchor each observation to a specific region or fee category from the payload. Stop after 3 observations.`;
      case "category_deep_dive": {
        const cat = params.focusCategory
          ? params.focusCategory.replace(/_/g, " ")
          : "the focus category";
        return `Explain WHY the ${cat} distribution looks the way it does for ${institutionName}'s peer set. Use the maturity field to flag where the sample is thin. Stop after 3 observations.`;
      }
      case "competitive_positioning":
        return `Explain WHY ${institutionName} sits where it does on the categories in top_fees. For each, cite the peer P25/median/P75 and identify whether it has pricing power, parity, or vulnerability. Stop after 3 categories.`;
    }
  })();

  return `${head}\n\n${NO_FLUFF_RULES}`;
}

/**
 * Recommendation-specific rules (layered on top of NO_FLUFF_RULES).
 * Recommendations have stricter shape requirements than the descriptive
 * sections (Executive Summary, Strategic Analysis).
 */
const RECOMMENDATION_RULES = `
${NO_FLUFF_RULES}

RECOMMENDATION-SPECIFIC RULES:
6. Output AT MOST 3 recommendations. Generic advice about "establishing leadership" or "building frameworks" is forbidden.
7. Each recommendation must include: (a) the fee category, (b) the peer median or P25/P75 anchor it should move toward, (c) one observable consequence (revenue direction, competitive percentile shift, or member-experience signal). If you cannot ground a recommendation in the DATA payload, omit it.
8. If you can ground 0 or 1 recommendations, return only that many. Better empty than meaningless.
`.trim();

function buildRecommendationContext(
  params: GenerateReportParams,
  institutionName: string
): string {
  const head = (() => {
    switch (params.templateType) {
      case "peer_benchmarking":
        return `Recommend up to 3 specific fee adjustments for ${institutionName}, each anchored to a peer-median or P75 figure from the DATA payload. Order by impact: largest variance from peer median first.`;
      case "regional_landscape":
        return `Recommend up to 3 regional moves for ${institutionName}, each tied to a specific market position visible in the DATA payload (e.g. "FL CU median is $X, ${institutionName} sits at $Y").`;
      case "category_deep_dive": {
        const cat = params.focusCategory
          ? params.focusCategory.replace(/_/g, " ")
          : "the focus category";
        return `Recommend up to 3 specific actions for ${institutionName} in the ${cat} category. Each must name the current peer P25/median/P75 anchor and the directional move (raise, hold, lower, restructure).`;
      }
      case "competitive_positioning":
        return `Recommend up to 3 specific repositioning moves for ${institutionName}, prioritizing the categories with the largest distance from peer median in the DATA payload.`;
    }
  })();

  return `${head}\n\n${RECOMMENDATION_RULES}`;
}

/**
 * Get the SectionType for the strategic section based on template.
 */
function getStrategicSectionType(
  templateType: ReportTemplateType
): "peer_comparison" | "regional_analysis" | "trend_analysis" | "peer_competitive" {
  switch (templateType) {
    case "peer_benchmarking":
      return "peer_comparison";
    case "regional_landscape":
      return "regional_analysis";
    case "category_deep_dive":
      return "trend_analysis";
    case "competitive_positioning":
      return "peer_competitive";
  }
}

/**
 * Generate a Hamilton report from a template and configuration.
 * Assembles fee data, calls generateSection() for key sections,
 * saves to hamilton_reports, and returns the assembled report.
 */
export async function generateReport(
  params: GenerateReportParams
): Promise<GenerateReportResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required" };

  try {
    // 1. Fetch fee index data as grounding for Hamilton
    const [
      indexData,
      selectedInstitution,
      selectedFees,
      selectedFinancials,
      selectedRevenueTrend,
      selectedPeerRanking,
      selectedEvidence,
    ] = await Promise.all([
      getNationalIndex(),
      params.institutionId ? getInstitutionById(params.institutionId).catch(() => null) : null,
      params.institutionId ? getFeesByInstitution(params.institutionId).catch(() => []) : [],
      params.institutionId ? getFinancialsByInstitution(params.institutionId).catch(() => []) : [],
      params.institutionId ? getInstitutionRevenueTrend(params.institutionId).catch(() => []) : [],
      params.institutionId ? getInstitutionPeerRanking(params.institutionId).catch(() => null) : null,
      params.institutionId ? getInstitutionFeeScheduleEvidence(params.institutionId).catch(() => null) : null,
    ]);
    const allCategories = indexData.filter((e) => e.institution_count >= 5);

    // For category_deep_dive, filter to focus category if provided
    const topCategories =
      params.templateType === "category_deep_dive" && params.focusCategory
        ? allCategories
            .filter((e) => e.fee_category === params.focusCategory)
            .concat(allCategories.filter((e) => e.fee_category !== params.focusCategory).slice(0, 9))
            .slice(0, 10)
        : allCategories.slice(0, 15);

    const institutionName =
      selectedInstitution?.institution_name ??
      params.selectedInstitutionName ??
      user.institution_name ??
      "Your Institution";
    const reportTitle = `${TEMPLATE_TITLES[params.templateType]} - ${institutionName} - ${params.dateFrom} to ${params.dateTo}`;
    const period = `${params.dateFrom} to ${params.dateTo}`;
    const selectedVisibleFees = selectedFees.filter((fee) => fee.review_status !== "rejected");
    const selectedVerifiedFees = selectedVisibleFees.filter((fee) => fee.review_status === "approved");
    const selectedProvisionalFees = selectedVisibleFees.filter((fee) => fee.review_status !== "approved");
    const pipelineCounts = selectedEvidence?.pipeline_counts ?? null;
    const pipelineFeeCount =
      Number(pipelineCounts?.raw_fee_count ?? 0) +
      Number(pipelineCounts?.verified_fee_count ?? 0);
    const hasSelectedInstitutionEvidence =
      selectedVerifiedFees.length > 0 ||
      selectedProvisionalFees.length > 0 ||
      pipelineFeeCount > 0;
    const latestFinancial = selectedFinancials[0] ?? null;

    if (params.institutionId && selectedInstitution && !hasSelectedInstitutionEvidence) {
      const report = buildInsufficientEvidenceReport({
        institutionName,
        period,
        statusLabel: getFeePublicationStatusLabel(
          selectedInstitution.fee_publication_status ?? "unavailable",
        ),
        verifiedCount: selectedInstitution.published_fee_count ?? 0,
        provisionalCount: selectedInstitution.provisional_fee_count ?? 0,
        assetSize: selectedInstitution.asset_size,
        latestSourceStatus: selectedInstitution.latest_source_status ?? null,
        latestFinancial: latestFinancial
          ? {
              report_date: latestFinancial.report_date,
              total_assets: latestFinancial.total_assets,
              service_charge_income: latestFinancial.service_charge_income,
            }
          : null,
      });
      const reportId = await saveHamiltonReport({
        userId: user.id,
        institutionId: selectedInstitution.id.toString(),
        reportType: params.templateType,
        reportJson: report,
        scenarioId: params.scenarioId ?? null,
      });
      return { success: true, reportId, report };
    }

    const selectedInstitutionData = selectedInstitution
      ? {
          id: selectedInstitution.id,
          name: selectedInstitution.institution_name,
          status: selectedInstitution.fee_publication_status ?? "unavailable",
          status_label: getFeePublicationStatusLabel(
            selectedInstitution.fee_publication_status ?? "unavailable",
          ),
          insight_readiness: selectedInstitution.insight_readiness ?? "source_needed",
          confidence_summary: selectedInstitution.confidence_summary ?? null,
          verified_fee_count: selectedInstitution.published_fee_count ?? 0,
          provisional_fee_count: selectedInstitution.provisional_fee_count ?? 0,
          latest_source_status: selectedInstitution.latest_source_status ?? null,
          financials: latestFinancial
            ? {
                report_date: latestFinancial.report_date,
                total_assets: latestFinancial.total_assets,
                total_deposits: latestFinancial.total_deposits,
                service_charge_income: latestFinancial.service_charge_income,
                total_revenue: latestFinancial.total_revenue,
                fee_income_ratio: latestFinancial.fee_income_ratio,
                roa: latestFinancial.roa,
              }
            : null,
          fee_rows: selectedVisibleFees.slice(0, 25).map((fee) => ({
            fee_name: fee.fee_name,
            fee_category: fee.fee_category ?? null,
            amount: fee.amount,
            frequency: fee.frequency,
            evidence_tier: fee.review_status === "approved" ? "verified" : "provisional",
            excluded_from_verified_benchmark: fee.review_status !== "approved",
            confidence: fee.extraction_confidence,
            source_url: fee.source_url ?? null,
          })),
          pipeline_counts: pipelineCounts,
          revenue_trend: selectedRevenueTrend.slice(0, 8),
          peer_ranking: selectedPeerRanking,
          evidence_policy: params.evidencePolicy ?? "provisional-first",
        }
      : null;

    // 2-4. Generate the three sections in parallel — they're independent
    // (no shared state, no ordering constraint). Was sequential and took
    // ~28s total; parallel cuts to ~10s (longest single call wins).
    const strategicSectionType = getStrategicSectionType(params.templateType);
    const [summarySection, strategicSection, recommendationSection] =
      await Promise.all([
        generateSection({
          type: "executive_summary",
          title: "Executive Summary",
          data: {
            report_type: params.templateType,
            period,
            institution_name: institutionName,
            selected_institution: selectedInstitutionData,
            focus_category: params.focusCategory ?? null,
            categories: topCategories.map((c) => ({
              fee_category: c.fee_category,
              median_amount: c.median_amount,
              p25_amount: c.p25_amount,
              p75_amount: c.p75_amount,
              institution_count: c.institution_count,
              maturity: c.maturity_tier,
            })),
          },
          context: buildExecutiveSummaryContext(params, institutionName, period),
        }),
        generateSection({
          type: strategicSectionType,
          title: "Strategic Analysis",
          data: {
            report_type: params.templateType,
            period,
            institution_name: institutionName,
            selected_institution: selectedInstitutionData,
            focus_category: params.focusCategory ?? null,
            top_fees: topCategories.slice(0, 5).map((c) => ({
              fee_category: c.fee_category,
              median_amount: c.median_amount,
              p25_amount: c.p25_amount,
              p75_amount: c.p75_amount,
              institution_count: c.institution_count,
            })),
          },
          context: buildStrategicContext(params, institutionName),
        }),
        generateSection({
          type: "recommendation",
          title: "Recommended Position",
          // Pass actual peer-anchored fee data so the model can write
          // specific recommendations instead of consultancy fluff. The
          // RECOMMENDATION_RULES context block forbids inventing figures
          // not present in this payload.
          data: {
            report_type: params.templateType,
            institution_name: institutionName,
            period,
            selected_institution: selectedInstitutionData,
            focus_category: params.focusCategory ?? null,
            peer_anchored_fees: topCategories.slice(0, 5).map((c) => ({
              fee_category: c.fee_category,
              peer_median: c.median_amount,
              peer_p25: c.p25_amount,
              peer_p75: c.p75_amount,
              institution_count: c.institution_count,
              maturity: c.maturity_tier,
            })),
          },
          context: buildRecommendationContext(params, institutionName),
        }),
      ]);

    // 5. Assemble ReportSummaryResponse
    const report: ReportSummaryResponse = {
      title: reportTitle,
      executiveSummary: summarySection.narrative
        .split("\n\n")
        .filter((p) => p.trim().length > 0),
      snapshot: [],
      strategicRationale: strategicSection.narrative,
      tradeoffs: topCategories.slice(0, 3).map((c) => ({
        label: c.fee_category.replace(/_/g, " "),
        value:
          c.median_amount != null
            ? `$${c.median_amount.toFixed(2)} median`
            : "Insufficient data",
      })),
      recommendation: recommendationSection.narrative,
      implementationNotes: [
        `Report generated ${new Date().toLocaleDateString()}`,
        `Analysis period: ${period}`,
        `Data covers ${indexData.length} fee categories across the national index`,
        selectedInstitution
          ? `Selected institution evidence policy: ${params.evidencePolicy ?? "provisional-first"}`
          : "All figures are pipeline-verified from published fee schedules",
        "Verified benchmark conclusions exclude provisional rows unless explicitly labeled otherwise.",
      ],
      exportControls: {
        pdfEnabled: true,
        shareEnabled: false,
      },
    };

    // 6. Save to hamilton_reports
    const institutionId =
      selectedInstitution?.id.toString() ||
      (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") ||
      "unknown";
    const reportId = await saveHamiltonReport({
      userId: user.id,
      institutionId,
      reportType: params.templateType,
      reportJson: report,
      scenarioId: params.scenarioId ?? null,
    });

    return { success: true, reportId, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Report generation failed: ${message}` };
  }
}

/**
 * Load user's recent reports for the left rail.
 */
export async function loadRecentReports() {
  const user = await getCurrentUser();
  if (!user) return [];
  return getRecentHamiltonReports(user.id);
}

/**
 * Load active scenarios for the scenario selector.
 */
export async function loadActiveScenarios() {
  const user = await getCurrentUser();
  if (!user) return [];
  return getActiveScenarios(user.id);
}

/**
 * Load a single report by ID.
 */
export async function loadReport(reportId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return getHamiltonReportById(reportId, user.id);
}

/**
 * Load a scenario by ID for the current user.
 * Filters by userId to prevent IDOR (T-53-04).
 */
export async function loadScenarioById(scenarioId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return getHamiltonScenarioById(scenarioId, user.id);
}

/**
 * Load a published BFI-authored report by ID.
 * Published reports use sentinel user_id = 0 and are accessible to all authenticated pro users.
 * Authentication is required — unauthenticated requests return null.
 */
export async function loadPublishedReport(reportId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const rows = await sql`
    SELECT id, report_type, report_json, created_at
    FROM hamilton_reports
    WHERE id = ${reportId}
      AND status = 'published'
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return rows[0];
}

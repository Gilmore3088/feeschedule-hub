"use server";

import { getCurrentUser } from "@/lib/auth";
import { getNationalIndex } from "@/lib/crawler-db/fee-index";
import { sql } from "@/lib/crawler-db/connection";
import { generateSection } from "@/lib/hamilton/generate";
import {
  saveHamiltonReport,
  getRecentHamiltonReports,
  getActiveScenarios,
  getHamiltonReportById,
  getHamiltonScenarioById,
} from "@/lib/hamilton/pro-tables";
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

/**
 * Build context string for the executive summary section by template type.
 * Each template type uses a different analytical lens.
 */
function buildExecutiveSummaryContext(
  params: GenerateReportParams,
  institutionName: string,
  period: string
): string {
  switch (params.templateType) {
    case "peer_benchmarking":
      return `Compare ${institutionName}'s fees to their configured peer set. Highlight categories where they are significantly above or below peer median. Use exact dollar figures from the data. Period: ${period}.`;
    case "regional_landscape":
      return `Analyze regional fee patterns across Federal Reserve districts for ${institutionName}. Identify geographic pricing trends and market positioning. Period: ${period}.`;
    case "category_deep_dive":
      return `Deep dive into ${params.focusCategory ? params.focusCategory.replace(/_/g, " ") : "key fee categories"} for ${institutionName}. Analyze current positioning, distribution across institutions, and competitive landscape. Include p25/p75 spread context. Period: ${period}.`;
    case "competitive_positioning":
      return `Assess competitive fee positioning across key categories for ${institutionName}. Identify where the institution has pricing power versus vulnerability relative to the market. Period: ${period}.`;
  }
}

/**
 * Build context string for the strategic section by template type.
 */
function buildStrategicContext(
  params: GenerateReportParams,
  institutionName: string
): string {
  switch (params.templateType) {
    case "peer_benchmarking":
      return `Peer comparison strategic rationale for ${institutionName}. Focus on categories where adjustment would align with peer positioning. Use the peer_comparison lens.`;
    case "regional_landscape":
      return `Regional analysis for ${institutionName}. Highlight which regions present opportunities or competitive pressure based on district-level fee data.`;
    case "category_deep_dive":
      return `Trend analysis for ${params.focusCategory ? params.focusCategory.replace(/_/g, " ") : "the focus category"} at ${institutionName}. Analyze distribution patterns and maturity of data coverage.`;
    case "competitive_positioning":
      return `Competitive intelligence for ${institutionName}. Map competitive advantages and blind spots across the fee schedule.`;
  }
}

/**
 * Build context string for the recommendation section by template type.
 */
function buildRecommendationContext(
  params: GenerateReportParams,
  institutionName: string
): string {
  switch (params.templateType) {
    case "peer_benchmarking":
      return `Recommend specific fee categories where ${institutionName} should adjust pricing to align with peer positioning. Be specific and action-oriented.`;
    case "regional_landscape":
      return `Recommend regional strategy for ${institutionName} based on geographic fee data. Identify highest-opportunity markets and competitive pressure points.`;
    case "category_deep_dive":
      return `Recommend a positioning strategy for ${institutionName} in the ${params.focusCategory ? params.focusCategory.replace(/_/g, " ") : "focus"} category based on distribution analysis.`;
    case "competitive_positioning":
      return `Recommend competitive fee strategy for ${institutionName}. Prioritize categories where pricing adjustment would have the greatest competitive impact.`;
  }
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
    const indexData = await getNationalIndex(false);
    const allCategories = indexData.filter((e) => e.institution_count >= 5);

    // For category_deep_dive, filter to focus category if provided
    const topCategories =
      params.templateType === "category_deep_dive" && params.focusCategory
        ? allCategories
            .filter((e) => e.fee_category === params.focusCategory)
            .concat(allCategories.filter((e) => e.fee_category !== params.focusCategory).slice(0, 9))
            .slice(0, 10)
        : allCategories.slice(0, 15);

    const institutionName = user.institution_name ?? "Your Institution";
    const reportTitle = `${TEMPLATE_TITLES[params.templateType]} — ${params.dateFrom} to ${params.dateTo}`;
    const period = `${params.dateFrom} to ${params.dateTo}`;

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
          data: {
            report_type: params.templateType,
            institution_name: institutionName,
            categories_analyzed: topCategories.length,
            period,
            focus_category: params.focusCategory ?? null,
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
        "All figures are pipeline-verified from published fee schedules",
      ],
      exportControls: {
        pdfEnabled: true,
        shareEnabled: false,
      },
    };

    // 6. Save to hamilton_reports
    const institutionId =
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

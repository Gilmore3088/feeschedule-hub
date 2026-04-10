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
} from "@/lib/hamilton/pro-tables";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

export type ReportTemplateType =
  | "quarterly_strategy"
  | "peer_brief"
  | "monthly_pulse"
  | "state_index";

export interface GenerateReportParams {
  templateType: ReportTemplateType;
  dateFrom: string;
  dateTo: string;
  peerSetId?: string;
  scenarioId?: string;
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
  quarterly_strategy: "Quarterly Strategy Report",
  peer_brief: "Peer Brief",
  monthly_pulse: "Monthly Pulse",
  state_index: "State Index",
};

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
    const topCategories = indexData
      .filter((e) => e.institution_count >= 5)
      .slice(0, 15);

    const reportTitle = `${TEMPLATE_TITLES[params.templateType]} — ${params.dateFrom} to ${params.dateTo}`;
    const period = `${params.dateFrom} to ${params.dateTo}`;

    // 2. Generate executive summary section
    const summarySection = await generateSection({
      type: "executive_summary",
      title: "Executive Summary",
      data: {
        report_type: params.templateType,
        period,
        institution_name: user.institution_name ?? "Your Institution",
        categories: topCategories.map((c) => ({
          fee_category: c.fee_category,
          median_amount: c.median_amount,
          institution_count: c.institution_count,
          maturity: c.maturity_tier,
        })),
      },
      context: `${TEMPLATE_TITLES[params.templateType]} for ${period}. Institution: ${user.institution_name ?? "Bank/Credit Union"}.`,
    });

    // 3. Generate strategic rationale section
    const strategicSection = await generateSection({
      type: "strategic",
      title: "Strategic Rationale",
      data: {
        report_type: params.templateType,
        period,
        top_fees: topCategories.slice(0, 5).map((c) => ({
          fee_category: c.fee_category,
          median_amount: c.median_amount,
          p25_amount: c.p25_amount,
          p75_amount: c.p75_amount,
        })),
      },
      context: `Strategic context for ${TEMPLATE_TITLES[params.templateType]}.`,
    });

    // 4. Generate recommendation section
    const recommendationSection = await generateSection({
      type: "recommendation",
      title: "Recommended Position",
      data: {
        report_type: params.templateType,
        institution_name: user.institution_name ?? "Your Institution",
        categories_analyzed: topCategories.length,
        period,
      },
      context: `Final recommendation for ${TEMPLATE_TITLES[params.templateType]}.`,
    });

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

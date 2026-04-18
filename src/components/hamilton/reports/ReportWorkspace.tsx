"use client";

import { useState, useEffect } from "react";
import { TemplateCard } from "./TemplateCard";
import { ConfigSidebar } from "./ConfigSidebar";
import { ReportOutput } from "./ReportOutput";
import { GeneratingState } from "./GeneratingState";
import { ReportLibrary } from "./ReportLibrary";
import {
  generateReport,
  loadActiveScenarios,
  loadScenarioById,
  type ReportTemplateType,
} from "@/app/pro/(hamilton)/reports/actions";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

type NarrativeTone = "consulting" | "academic" | "executive" | "technical";

const TEMPLATES: Array<{
  type: ReportTemplateType;
  title: string;
  description: string;
  tags: string[];
  icon: string;
}> = [
  {
    type: "peer_benchmarking",
    title: "Peer Benchmarking Report",
    description:
      "Compare your institution's fee schedule against your configured peer set with category-by-category analysis.",
    tags: ["Peer Analysis", "Comparative"],
    icon: "group_work",
  },
  {
    type: "regional_landscape",
    title: "Regional Fee Landscape",
    description:
      "Fee patterns across Federal Reserve districts and state-level pricing trends in your market.",
    tags: ["Geographic", "Market Intel"],
    icon: "map",
  },
  {
    type: "category_deep_dive",
    title: "Category Deep Dive",
    description:
      "Single fee category analysis: distribution, percentile positioning, peer comparison, and trend context.",
    tags: ["Focused", "Tactical"],
    icon: "analytics",
  },
  {
    type: "competitive_positioning",
    title: "Competitive Positioning",
    description:
      "Identify pricing power and vulnerability across your fee schedule relative to direct competitors.",
    tags: ["Strategy", "Competitive"],
    icon: "leaderboard",
  },
];

interface ReportWorkspaceProps {
  userId: number;
  /** Real institution name from server (audit H-4 round 2). */
  institutionName: string;
  publishedReports: Array<{
    id: string;
    report_type: string;
    title: string;
    created_at: string;
    report_json: ReportSummaryResponse;
  }>;
  initialScenarioId: string | null;
}

export function ReportWorkspace({
  userId,
  institutionName,
  publishedReports,
  initialScenarioId,
}: ReportWorkspaceProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReportTemplateType | null>(null);
  const [focusArea, setFocusArea] = useState("Fee Benchmarking");
  const [narrativeTone, setNarrativeTone] = useState<NarrativeTone>("consulting");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [generatedReport, setGeneratedReport] =
    useState<ReportSummaryResponse | null>(null);
  const [generatedReportType, setGeneratedReportType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<
    "preview" | "board" | "analyst" | "export"
  >("preview");

  // Load scenarios on mount (kept for future scenario linking)
  useEffect(() => {
    loadActiveScenarios().catch(() => {});
  }, [userId]);

  // Scenario pre-fill: when arriving from /pro/simulate?scenario_id=X,
  // auto-select Category Deep Dive and pre-fill the focus area from the scenario's fee_category.
  useEffect(() => {
    if (!initialScenarioId) return;
    let cancelled = false;
    loadScenarioById(initialScenarioId).then((scenario) => {
      if (cancelled || !scenario) return;
      setSelectedTemplate("category_deep_dive");
      setFocusArea(scenario.fee_category.replace(/_/g, " "));
    });
    return () => { cancelled = true; };
  }, [initialScenarioId]);

  function handleTemplateClick(type: ReportTemplateType) {
    setSelectedTemplate((prev) => (prev === type ? null : type));
  }

  /**
   * Show a published report inline by loading its pre-built report_json into state.
   * No generation step required — reuses ReportOutput directly.
   */
  function handleViewPublishedReport(
    report: ReportSummaryResponse,
    reportType: string
  ) {
    setGeneratedReport(report);
    setGeneratedReportType(reportType);
    setError(null);
    setIsGenerating(false);
    // Scroll the preview area into view
    setTimeout(() => {
      const previewEl = document.getElementById("report-preview-section");
      if (previewEl) {
        previewEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedReport(null);

    const today = new Date().toISOString().split("T")[0];
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateFrom = threeMonthsAgo.toISOString().split("T")[0];

    const result = await generateReport({
      templateType: selectedTemplate,
      dateFrom,
      dateTo: today,
      focusCategory: selectedTemplate === "category_deep_dive" ? focusArea.replace(/ /g, "_") : undefined,
      scenarioId: initialScenarioId ?? undefined,
    });

    setIsGenerating(false);

    if (result.success) {
      setGeneratedReport(result.report);
      setGeneratedReportType(selectedTemplate);
    } else {
      setError(result.error);
    }
  }

  async function handleExportPdf() {
    if (!generatedReport) return;
    setIsPdfExporting(true);
    try {
      const res = await fetch("/api/pro/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: generatedReport,
          reportType: generatedReportType,
        }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `hamilton-report-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Non-blocking
    } finally {
      setIsPdfExporting(false);
    }
  }

  const reportGenerated = generatedReport !== null;

  return (
    <div className="px-6 pb-20">
      {/* Page header */}
      <header className="mb-12">
        <h1 className="font-headline text-6xl italic tracking-tighter text-on-surface mb-2">
          Report Builder
        </h1>
        <p
          className="font-body max-w-xl"
          style={{ color: "var(--hamilton-secondary)" }}
        >
          Synthesize market intelligence into board-ready narratives. Select a
          framework or create a custom inquiry from the institutional data lake.
        </p>
      </header>

      {/* Error banner */}
      {error && (
        <div
          className="mb-8 p-4 text-sm border"
          style={{
            borderColor: "#dc2626",
            color: "#dc2626",
            backgroundColor: "rgba(220,38,38,0.05)",
          }}
        >
          {error}
        </div>
      )}

      {/* Generate New Report — primary workflow above the fold (audit H-1).
          Page is named "Report Builder" — the build affordance must be the
          dominant action. Published library appears below as recent-history. */}
      <div className="grid grid-cols-12 gap-12 items-start">
        {/* Left: Template Gallery + Preview */}
        <section className="col-span-12 lg:col-span-8">
          {/* Section label — "Generate New Report" per D-02 */}
          <div className="mb-6">
            <h2
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-primary"
            >
              Generate New Report
            </h2>
          </div>

          {/* 2×2 template card grid */}
          <div
            role="radiogroup"
            aria-label="Report template"
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {TEMPLATES.map((t) => (
              <TemplateCard
                key={t.type}
                type={t.type}
                title={t.title}
                description={t.description}
                tags={t.tags}
                icon={t.icon}
                isSelected={selectedTemplate === t.type}
                onClick={() => handleTemplateClick(t.type)}
              />
            ))}
          </div>

          {/* Narrative Preview Section */}
          <div
            id="report-preview-section"
            className="mt-16 pt-12"
            style={{ borderTop: "1px solid rgba(216,194,184,0.2)" }}
          >
            {/* Tab strip — only render once a report exists (audit M-4 round 2).
                Empty tabs for non-existent output were a premature affordance. */}
            {(reportGenerated || isGenerating) && (
              <div className="flex gap-12 mb-8 overflow-x-auto pb-4">
                {(
                  [
                    { id: "preview", label: "Preview" },
                    { id: "board", label: "Board Version" },
                    { id: "analyst", label: "Analyst Version" },
                    { id: "export", label: "Export" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePreviewTab(tab.id)}
                    className="text-[10px] uppercase tracking-widest whitespace-nowrap pb-2 transition-colors"
                    style={{
                      fontWeight: activePreviewTab === tab.id ? 700 : 400,
                      borderBottom:
                        activePreviewTab === tab.id
                          ? "2px solid var(--hamilton-primary)"
                          : "2px solid transparent",
                      color:
                        activePreviewTab === tab.id
                          ? "var(--hamilton-on-surface)"
                          : "var(--hamilton-secondary)",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Generating overlay */}
            {isGenerating && <GeneratingState />}

            {/* Generated or published report output */}
            {!isGenerating && reportGenerated && generatedReport && (
              <ReportOutput
                report={generatedReport}
                reportType={generatedReportType}
              />
            )}

            {/* Empty-state hint (audit M-5 round 2) — small inline cue.
                Was a 12-padding card with quote + 2 paragraphs (~400px tall).
                Now ~80px: tells the user what to do, doesn't dominate. */}
            {!isGenerating && !reportGenerated && (
              <div
                className="flex items-center gap-3 text-sm py-3"
                style={{ color: "var(--hamilton-secondary)" }}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ color: "var(--hamilton-primary)", opacity: 0.6 }}
                  aria-hidden="true"
                >
                  arrow_upward
                </span>
                <span>
                  Pick a template above and click <strong style={{ color: "var(--hamilton-on-surface)" }}>Generate Intelligence</strong> to draft a report from your live fee data.
                </span>
              </div>
            )}

            {/* Export PDF — shown after generation */}
            {reportGenerated && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isPdfExporting}
                  className="burnished-cta text-white py-3 px-6 text-[10px] uppercase tracking-[0.3em] font-bold transition-transform active:scale-95"
                  style={{ opacity: isPdfExporting ? 0.7 : 1 }}
                >
                  {isPdfExporting ? "Preparing PDF..." : "Export PDF"}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Configuration sidebar — right side for now, moves to left rail in v8.2 */}
        <ConfigSidebar
          selectedTemplate={selectedTemplate}
          institutionName={institutionName}
          peerSetLabel="National Index"
          focusArea={focusArea}
          narrativeTone={narrativeTone}
          isGenerating={isGenerating}
          onFocusAreaChange={setFocusArea}
          onNarrativeToneChange={setNarrativeTone}
          onGenerate={handleGenerate}
        />
      </div>

      {/* Visual separator between generator and library */}
      <div
        className="mt-20 mb-12"
        style={{ borderTop: "1px solid rgba(216,194,184,0.2)" }}
      />

      {/* Published Reports library — recent-history reference, below the
          generator (audit H-1 reordering). */}
      <ReportLibrary
        reports={publishedReports}
        onViewReport={handleViewPublishedReport}
      />
    </div>
  );
}

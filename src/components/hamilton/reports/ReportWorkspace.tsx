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
    type: "quarterly_strategy",
    title: "Quarterly Strategy Report",
    description:
      "A comprehensive look at capital allocation across core portfolios relative to benchmark drift.",
    tags: ["Full Scale", "Institutional"],
    icon: "history_edu",
  },
  {
    type: "peer_brief",
    title: "Peer Brief",
    description:
      "Direct comparative analysis against established peer set metrics and strategic pivots.",
    tags: ["Comparative", "Daily Ops"],
    icon: "group_work",
  },
  {
    type: "monthly_pulse",
    title: "Monthly Pulse",
    description:
      "High-frequency indicators summarized for tactical executive decision-making.",
    tags: ["Tactical", "Summary"],
    icon: "timeline",
  },
  {
    type: "state_index",
    title: "State Index",
    description:
      "Geopolitical and regulatory risk mapping for cross-border institutional assets.",
    tags: ["Risk Alpha", "Macro"],
    icon: "map",
  },
];

interface ReportWorkspaceProps {
  userId: number;
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
  publishedReports,
  initialScenarioId,
}: ReportWorkspaceProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReportTemplateType | null>(null);
  const [institution, setInstitution] = useState("Hamilton Global Partners");
  const [peerSet, setPeerSet] = useState("tier1");
  const [focusArea, setFocusArea] = useState("Capital Allocation");
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

  // initialScenarioId is accepted for Plan 02 wiring — not implemented in this plan
  void initialScenarioId;

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
  const previewTimestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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

      {/* Published Reports Library — PRIMARY view at top of page (D-01) */}
      <ReportLibrary
        reports={publishedReports}
        onViewReport={handleViewPublishedReport}
      />

      {/* Visual separator between library and generator */}
      <div
        className="mt-16 mb-12"
        style={{ borderTop: "1px solid rgba(216,194,184,0.2)" }}
      />

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

      <div className="grid grid-cols-12 gap-12 items-start">
        {/* Left: Template Gallery + Preview */}
        <section className="col-span-12 lg:col-span-8">
          {/* Section label — "Generate New Report" per D-02 */}
          <div className="mb-6 flex justify-between items-end">
            <h2
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-primary"
            >
              Generate New Report
            </h2>
            <span
              className="text-xs font-sans underline cursor-pointer"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              View full archive
            </span>
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
            {/* Tab strip */}
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

            {/* Generating overlay */}
            {isGenerating && <GeneratingState />}

            {/* Generated or published report output */}
            {!isGenerating && reportGenerated && generatedReport && (
              <ReportOutput
                report={generatedReport}
                reportType={generatedReportType}
              />
            )}

            {/* Static preview / quote block */}
            {!isGenerating && !reportGenerated && (
              <div className="bg-surface-container-lowest p-12 editorial-shadow max-w-3xl">
                <span
                  className="text-[10px] uppercase tracking-[0.3em] block mb-6 text-primary"
                >
                  Strategic Outlook Fragment
                </span>
                <h4 className="font-headline text-4xl italic mb-8 leading-tight text-on-surface">
                  &ldquo;The institution maintains a robust posture against
                  inflationary headwinds, prioritizing liquid alts in the
                  short-term window.&rdquo;
                </h4>
                <div
                  className="space-y-6 text-sm leading-relaxed"
                  style={{ color: "var(--hamilton-secondary)" }}
                >
                  <p>
                    Current market dynamics suggest a deliberate migration
                    toward fixed-income primitives as central bank signals
                    remain hawkish. Our analysis indicates that while the
                    broader sector remains exposed to volatility, the Hamilton
                    Private pool is positioned with a 12% alpha buffer.
                  </p>
                  <p>
                    Recommendation: Continued accumulation in emerging energy
                    infrastructure, specifically targeted toward the Nordic
                    region where regulatory tailwinds are most favorable.
                  </p>
                </div>
                <div className="mt-12 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="material-symbols-outlined"
                      style={{ color: "var(--hamilton-primary)" }}
                    >
                      verified_user
                    </span>
                    <span className="text-[10px] uppercase tracking-widest">
                      Validated by Hamilton AI Terminal
                    </span>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: "var(--hamilton-secondary)" }}
                  >
                    {previewTimestamp}
                  </span>
                </div>
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

        {/* Right: Configuration sidebar */}
        <ConfigSidebar
          selectedTemplate={selectedTemplate}
          institution={institution}
          peerSet={peerSet}
          focusArea={focusArea}
          narrativeTone={narrativeTone}
          isGenerating={isGenerating}
          onInstitutionChange={setInstitution}
          onPeerSetChange={setPeerSet}
          onFocusAreaChange={setFocusArea}
          onNarrativeToneChange={setNarrativeTone}
          onGenerate={handleGenerate}
        />
      </div>
    </div>
  );
}

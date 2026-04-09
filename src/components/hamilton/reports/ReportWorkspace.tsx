"use client";

import { useState, useEffect } from "react";
import { TemplateCard } from "./TemplateCard";
import { ConfigSidebar } from "./ConfigSidebar";
import { ReportOutput } from "./ReportOutput";
import { GeneratingState } from "./GeneratingState";
import { EmptyState } from "./EmptyState";
import {
  generateReport,
  loadActiveScenarios,
  type ReportTemplateType,
} from "@/app/pro/(hamilton)/reports/actions";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

const TEMPLATES: Array<{
  type: ReportTemplateType;
  title: string;
  description: string;
  estimatedTime: string;
}> = [
  {
    type: "quarterly_strategy",
    title: "Quarterly Strategy Report",
    description:
      "Comprehensive quarterly fee positioning analysis with peer benchmarks and strategic rationale.",
    estimatedTime: "~30 seconds",
  },
  {
    type: "peer_brief",
    title: "Peer Brief",
    description:
      "Targeted peer comparison across your defined peer set with delta analysis.",
    estimatedTime: "~20 seconds",
  },
  {
    type: "monthly_pulse",
    title: "Monthly Pulse",
    description: "Concise monthly fee movement summary with trend highlights.",
    estimatedTime: "~15 seconds",
  },
  {
    type: "state_index",
    title: "State Index",
    description:
      "State-level fee landscape with district context and regional benchmarks.",
    estimatedTime: "~25 seconds",
  },
];

interface Scenario {
  id: string;
  fee_category: string;
  current_value: number;
  proposed_value: number;
  confidence_tier: string;
}

interface ReportWorkspaceProps {
  userId: number;
}

export function ReportWorkspace({ userId }: ReportWorkspaceProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReportTemplateType | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [peerSetId, setPeerSetId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [generatedReport, setGeneratedReport] =
    useState<ReportSummaryResponse | null>(null);
  const [generatedReportType, setGeneratedReportType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Load scenarios on mount
  useEffect(() => {
    loadActiveScenarios()
      .then((s) => setScenarios(s as Scenario[]))
      .catch(() => {});
  }, [userId]);

  function handleTemplateClick(type: ReportTemplateType) {
    // Radio behavior: clicking selected template deselects
    setSelectedTemplate((prev) => (prev === type ? null : type));
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedReport(null);

    const result = await generateReport({
      templateType: selectedTemplate,
      dateFrom,
      dateTo,
      peerSetId: peerSetId || undefined,
      scenarioId: scenarioId || undefined,
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
      // Non-blocking — user sees the button return to normal state
    } finally {
      setIsPdfExporting(false);
    }
  }

  const reportGenerated = generatedReport !== null;

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 180px)" }}>
      {/* Config sidebar */}
      <ConfigSidebar
        selectedTemplate={selectedTemplate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        peerSetId={peerSetId}
        scenarioId={scenarioId}
        scenarios={scenarios}
        isGenerating={isGenerating}
        reportGenerated={reportGenerated}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onPeerSetChange={setPeerSetId}
        onScenarioChange={setScenarioId}
        onGenerate={handleGenerate}
        onExportPdf={handleExportPdf}
        isPdfExporting={isPdfExporting}
      />

      {/* Main content panel */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Error state */}
        {error && (
          <div
            className="mx-4 mt-4 p-4 rounded border text-sm"
            style={{
              borderColor: "#dc2626",
              color: "#dc2626",
              backgroundColor: "rgba(220, 38, 38, 0.05)",
            }}
          >
            {error}
          </div>
        )}

        {/* Generating state */}
        {isGenerating && <GeneratingState />}

        {/* Report output — post generation */}
        {!isGenerating && reportGenerated && generatedReport && (
          <ReportOutput report={generatedReport} reportType={generatedReportType} />
        )}

        {/* Template gallery — pre-generation, no report yet */}
        {!isGenerating && !reportGenerated && (
          <div className="p-6">
            {/* Page title */}
            <h1
              className="text-3xl font-bold mb-2 leading-tight"
              style={{
                fontFamily: "var(--hamilton-font-serif)",
                color: "var(--hamilton-text-primary)",
              }}
            >
              Report Builder
            </h1>
            <p
              className="text-[15px] mb-8"
              style={{ color: "var(--hamilton-text-secondary)" }}
            >
              Select a template to generate a McKinsey-grade executive report.
            </p>

            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-4"
              style={{ color: "var(--hamilton-text-tertiary)" }}
            >
              Select Template
            </div>

            <div
              role="radiogroup"
              aria-label="Report template"
              className="grid grid-cols-2 gap-4"
            >
              {TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.type}
                  type={t.type}
                  title={t.title}
                  description={t.description}
                  estimatedTime={t.estimatedTime}
                  isSelected={selectedTemplate === t.type}
                  onClick={() => handleTemplateClick(t.type)}
                />
              ))}
            </div>

            {/* Empty state — shown when no template selected */}
            {selectedTemplate === null && (
              <div className="mt-12">
                <EmptyState />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

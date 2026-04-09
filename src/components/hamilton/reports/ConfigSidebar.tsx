"use client";

import { Download, Loader2 } from "lucide-react";
import type { ReportTemplateType } from "@/app/pro/(hamilton)/reports/actions";

interface Scenario {
  id: string;
  fee_category: string;
  current_value: number;
  proposed_value: number;
  confidence_tier: string;
}

interface ConfigSidebarProps {
  selectedTemplate: ReportTemplateType | null;
  dateFrom: string;
  dateTo: string;
  peerSetId: string;
  scenarioId: string;
  scenarios: Scenario[];
  isGenerating: boolean;
  reportGenerated: boolean;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onPeerSetChange: (v: string) => void;
  onScenarioChange: (v: string) => void;
  onGenerate: () => void;
  onExportPdf: () => void;
  isPdfExporting: boolean;
}

export function ConfigSidebar({
  selectedTemplate,
  dateFrom,
  dateTo,
  scenarios,
  scenarioId,
  isGenerating,
  reportGenerated,
  onDateFromChange,
  onDateToChange,
  onScenarioChange,
  onGenerate,
  onExportPdf,
  isPdfExporting,
}: ConfigSidebarProps) {
  const canGenerate = selectedTemplate !== null && !isGenerating;

  return (
    <aside
      className="flex-shrink-0 flex flex-col border-r"
      style={{
        width: "280px",
        borderColor: "var(--hamilton-border)",
        backgroundColor: "var(--hamilton-surface)",
        padding: "24px 16px",
      }}
    >
      {/* Section heading */}
      <div className="mb-6">
        <h2
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Report Configuration
        </h2>
      </div>

      {/* Analysis Period */}
      <div className="mb-5">
        <label
          className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          Analysis Period
        </label>
        <div className="flex flex-col gap-2">
          <div>
            <span
              className="block text-[11px] mb-1"
              style={{ color: "var(--hamilton-text-tertiary)" }}
            >
              From
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full text-sm px-3 py-1.5 rounded border"
              style={{
                borderColor: "var(--hamilton-border)",
                backgroundColor: "var(--hamilton-surface-elevated)",
                color: "var(--hamilton-text-primary)",
                outline: "none",
              }}
            />
          </div>
          <div>
            <span
              className="block text-[11px] mb-1"
              style={{ color: "var(--hamilton-text-tertiary)" }}
            >
              To
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full text-sm px-3 py-1.5 rounded border"
              style={{
                borderColor: "var(--hamilton-border)",
                backgroundColor: "var(--hamilton-surface-elevated)",
                color: "var(--hamilton-text-primary)",
                outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Scenario Link (optional) */}
      <div className="mb-6">
        <label
          className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          Link a Scenario (optional)
        </label>
        <select
          value={scenarioId}
          onChange={(e) => onScenarioChange(e.target.value)}
          disabled={scenarios.length === 0}
          className="w-full text-sm px-3 py-1.5 rounded border"
          style={{
            borderColor: "var(--hamilton-border)",
            backgroundColor: "var(--hamilton-surface-elevated)",
            color:
              scenarios.length === 0
                ? "var(--hamilton-text-tertiary)"
                : "var(--hamilton-text-primary)",
            outline: "none",
          }}
        >
          <option value="">
            {scenarios.length === 0
              ? "No scenarios saved yet"
              : "Select a saved scenario..."}
          </option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fee_category.replace(/_/g, " ")} scenario
            </option>
          ))}
        </select>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Generate button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        aria-busy={isGenerating}
        className="w-full py-2.5 px-4 rounded font-semibold text-sm text-white mb-3 transition-opacity flex items-center justify-center gap-2"
        style={{
          background: canGenerate
            ? "var(--hamilton-gradient-cta)"
            : "var(--hamilton-surface-elevated)",
          color: canGenerate ? "white" : "var(--hamilton-text-tertiary)",
          cursor: canGenerate ? "pointer" : "not-allowed",
          opacity: isGenerating ? 0.8 : 1,
        }}
      >
        {isGenerating && <Loader2 size={14} className="animate-spin" />}
        {isGenerating ? "Generating..." : "Generate Report"}
      </button>

      {/* Export PDF button — only shown after report generated */}
      {reportGenerated && (
        <button
          type="button"
          onClick={onExportPdf}
          disabled={isPdfExporting}
          aria-label="Export report as PDF"
          className="w-full py-2 px-4 rounded font-medium text-sm flex items-center justify-center gap-2 border transition-opacity"
          style={{
            borderColor: "var(--hamilton-accent)",
            color: "var(--hamilton-text-accent)",
            backgroundColor: "transparent",
            cursor: isPdfExporting ? "not-allowed" : "pointer",
            opacity: isPdfExporting ? 0.7 : 1,
          }}
        >
          {isPdfExporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {isPdfExporting ? "Preparing PDF..." : "Export PDF"}
        </button>
      )}
    </aside>
  );
}

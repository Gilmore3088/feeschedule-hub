import type { ReportSummaryResponse } from "@/lib/hamilton/types";
import { ReportSection } from "./ReportSection";
import { StatCalloutBox } from "./StatCalloutBox";

interface ReportOutputProps {
  report: ReportSummaryResponse;
  reportType: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  quarterly_strategy: "Quarterly Strategy Report",
  peer_brief: "Peer Brief",
  monthly_pulse: "Monthly Pulse",
  state_index: "State Index",
};

export function ReportOutput({ report, reportType }: ReportOutputProps) {
  const typeLabel = REPORT_TYPE_LABELS[reportType] ?? reportType;

  return (
    <article className="max-w-3xl mx-auto px-4 pb-16">
      {/* Report header */}
      <header
        className="pt-8 pb-8 border-b"
        style={{ borderColor: "var(--hamilton-border)" }}
      >
        {/* Report type badge */}
        <span
          className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded mb-4"
          style={{
            backgroundColor: "var(--hamilton-accent-subtle)",
            color: "var(--hamilton-text-accent)",
          }}
        >
          {typeLabel}
        </span>

        <h1
          className="text-3xl font-bold leading-tight mb-3"
          style={{
            fontFamily: "var(--hamilton-font-serif)",
            color: "var(--hamilton-text-primary)",
          }}
        >
          {report.title}
        </h1>

        {/* Read-only notice */}
        <p
          className="text-[11px]"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          This report is read-only. Use Export PDF to save.
        </p>
      </header>

      {/* Executive Summary */}
      <ReportSection heading="Executive Summary">
        {report.executiveSummary.map((paragraph, i) => (
          <p
            key={i}
            className="text-[15px] leading-relaxed mb-4 last:mb-0"
            style={{ color: "var(--hamilton-text-primary)" }}
          >
            {paragraph}
          </p>
        ))}
      </ReportSection>

      {/* Current vs Proposed Snapshot — only if scenario data present */}
      {report.snapshot.length > 0 && (
        <ReportSection heading="Current vs Proposed Snapshot">
          <div className="grid grid-cols-2 gap-4">
            {report.snapshot.map((item, i) => (
              <StatCalloutBox
                key={i}
                label={item.label}
                current={item.current}
                proposed={item.proposed}
              />
            ))}
          </div>
        </ReportSection>
      )}

      {/* Strategic Rationale */}
      <ReportSection heading="Strategic Rationale">
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--hamilton-text-primary)" }}
        >
          {report.strategicRationale}
        </p>
      </ReportSection>

      {/* Tradeoff Summary */}
      {report.tradeoffs.length > 0 && (
        <ReportSection heading="Tradeoff Summary">
          <div className="grid grid-cols-2 gap-4">
            {report.tradeoffs.map((item, i) => (
              <div
                key={i}
                className="hamilton-card p-4"
                style={{ backgroundColor: "var(--hamilton-surface-elevated)" }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--hamilton-text-secondary)" }}
                >
                  {item.label}
                </div>
                <div
                  className="text-base font-semibold tabular-nums"
                  style={{ color: "var(--hamilton-text-primary)" }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Recommended Position */}
      <ReportSection heading="Recommended Position">
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--hamilton-text-primary)" }}
        >
          {report.recommendation}
        </p>
      </ReportSection>

      {/* Implementation Notes */}
      {report.implementationNotes.length > 0 && (
        <ReportSection heading="Implementation Notes">
          <ul className="space-y-2">
            {report.implementationNotes.map((note, i) => (
              <li
                key={i}
                className="text-[15px] leading-relaxed flex items-start gap-2"
                style={{ color: "var(--hamilton-text-secondary)" }}
              >
                <span style={{ color: "var(--hamilton-accent)" }} aria-hidden="true">
                  —
                </span>
                {note}
              </li>
            ))}
          </ul>
        </ReportSection>
      )}
    </article>
  );
}

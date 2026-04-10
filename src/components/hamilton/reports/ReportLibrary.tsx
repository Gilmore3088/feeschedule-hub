"use client";

import { useState } from "react";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

interface PublishedReport {
  id: string;
  report_type: string;
  title: string;
  created_at: string;
  report_json: ReportSummaryResponse;
}

interface ReportLibraryProps {
  reports: PublishedReport[];
  onViewReport: (report: ReportSummaryResponse, reportType: string) => void;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  quarterly_strategy: "Quarterly Report",
  monthly_pulse: "Monthly Pulse",
  state_index: "Regional Analysis",
  peer_brief: "Peer Brief",
  peer_benchmarking: "Peer Benchmarking",
  regional_landscape: "Regional Landscape",
  category_deep_dive: "Category Deep Dive",
  competitive_positioning: "Competitive Positioning",
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ReportLibrary({ reports, onViewReport }: ReportLibraryProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadPdf(report: PublishedReport) {
    setDownloadingId(report.id);
    try {
      const res = await fetch("/api/pro/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: report.report_json,
          reportType: report.report_type,
        }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = report.title.toLowerCase().replace(/\s+/g, "-").slice(0, 40);
      a.href = url;
      a.download = `hamilton-${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Non-blocking — user can retry
    } finally {
      setDownloadingId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <section className="mb-16">
        <div className="mb-6">
          <h2
            className="font-headline text-3xl italic text-on-surface mb-1"
          >
            Published Reports
          </h2>
          <p
            className="text-xs"
            style={{ color: "var(--hamilton-secondary)" }}
          >
            Curated Hamilton intelligence publications
          </p>
        </div>
        <p
          className="text-sm"
          style={{ color: "var(--hamilton-secondary)" }}
        >
          No published reports available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-16">
      {/* Section header */}
      <div className="mb-8">
        <h2 className="font-headline text-3xl italic text-on-surface mb-1">
          Published Reports
        </h2>
        <p
          className="text-xs"
          style={{ color: "var(--hamilton-secondary)" }}
        >
          Curated Hamilton intelligence publications
        </p>
      </div>

      {/* Report card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((report) => {
          const typeLabel =
            REPORT_TYPE_LABELS[report.report_type] ?? report.report_type;
          const isDownloading = downloadingId === report.id;

          return (
            <article
              key={report.id}
              className="bg-surface-container-lowest p-6 editorial-shadow hover:shadow-md transition-shadow"
            >
              {/* Report type badge */}
              <span
                className="block text-[10px] uppercase tracking-[0.2em] mb-3 font-semibold text-primary"
              >
                {typeLabel}
              </span>

              {/* Title */}
              <h3 className="font-headline text-xl italic text-on-surface mb-3 leading-tight">
                {report.title}
              </h3>

              {/* Date */}
              <p
                className="text-xs mb-6"
                style={{ color: "var(--hamilton-secondary)" }}
              >
                {formatDate(report.created_at)}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => onViewReport(report.report_json, report.report_type)}
                  className="text-primary text-xs uppercase tracking-widest font-bold hover:opacity-70 transition-opacity"
                >
                  Read
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadPdf(report)}
                  disabled={isDownloading}
                  className="flex items-center gap-1 text-xs uppercase tracking-widest transition-opacity hover:opacity-70"
                  style={{
                    color: "var(--hamilton-secondary)",
                    opacity: isDownloading ? 0.5 : 1,
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    download
                  </span>
                  {isDownloading ? "Preparing..." : "Download PDF"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * /reports — Public report catalog
 * ISR-cached (1-hour revalidation). Server-rendered, no client components.
 * Lists all published reports with server-side filtering by type and date.
 */

import type { Metadata } from "next";
import { getSql } from "@/lib/crawler-db/connection";
import type { PublishedReport, ReportType } from "@/lib/report-engine/types";
import { timeAgo } from "@/lib/format";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Research Reports — Bank Fee Index",
  description:
    "Browse published bank fee research reports from Bank Fee Index. National indexes, state analysis, peer benchmarks, and monthly pulse reports.",
};

// Human-readable labels for report types
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  national_index: "National Index",
  state_index: "State Index",
  peer_brief: "Peer Brief",
  monthly_pulse: "Monthly Pulse",
};

const VALID_REPORT_TYPES: Set<string> = new Set<ReportType>([
  "national_index",
  "state_index",
  "peer_brief",
  "monthly_pulse",
]);

// Date range options for the filter
const DATE_RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 6 months" },
  { value: "365d", label: "Last 12 months" },
];

function dateRangeToIso(range: string): string | null {
  const days: Record<string, number> = {
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
  };
  const n = days[range];
  if (!n) return null;
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;

  // Sanitize inputs (T-16-03)
  const typeFilter =
    rawType && VALID_REPORT_TYPES.has(rawType) ? rawType : null;
  const fromIso = rawRange ? dateRangeToIso(rawRange) : null;

  let reports: PublishedReport[] = [];

  try {
    const sql = getSql();
    reports = await sql<PublishedReport[]>`
      SELECT id, report_type, slug, title, published_at
      FROM published_reports
      WHERE is_public = true
        ${typeFilter ? sql` AND report_type = ${typeFilter}` : sql``}
        ${fromIso ? sql` AND published_at >= ${fromIso}` : sql``}
      ORDER BY published_at DESC
      LIMIT 100
    `;
  } catch {
    // Render empty state gracefully if DB unavailable at build time
    reports = [];
  }

  return (
    <main>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 24px 96px" }}>

        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <p style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#C44B2E",
            fontWeight: 700,
            marginBottom: "12px",
          }}>
            Research
          </p>
          <h1 style={{
            fontSize: "36px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#1A1815",
            marginBottom: "12px",
            fontFamily: "var(--font-newsreader), Georgia, serif",
            lineHeight: 1.2,
          }}>
            Research Reports
          </h1>
          <p style={{ fontSize: "16px", color: "#5A5347", lineHeight: 1.6, maxWidth: "560px" }}>
            Published analysis from Bank Fee Index Research — national indexes, state benchmarks, peer comparisons, and monthly fee intelligence.
          </p>
        </div>

        {/* Filter bar — server-rendered form, no JS required */}
        <form
          method="GET"
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "40px",
            flexWrap: "wrap",
          }}
        >
          <select
            name="type"
            defaultValue={typeFilter ?? ""}
            style={{
              border: "1px solid #E8DFD1",
              borderRadius: "6px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#1A1815",
              background: "#FEFCF9",
              cursor: "pointer",
            }}
          >
            <option value="">All report types</option>
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            name="range"
            defaultValue={rawRange ?? ""}
            style={{
              border: "1px solid #E8DFD1",
              borderRadius: "6px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#1A1815",
              background: "#FEFCF9",
              cursor: "pointer",
            }}
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            style={{
              background: "#1A1815",
              color: "#FEFCF9",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Filter
          </button>

          {(typeFilter || rawRange) && (
            <a
              href="/reports"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                fontSize: "13px",
                color: "#5A5347",
                textDecoration: "none",
                border: "1px solid #E8DFD1",
                borderRadius: "6px",
                background: "transparent",
              }}
            >
              Clear filters
            </a>
          )}
        </form>

        {/* Report list */}
        {reports.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <p style={{ color: "#A09788", fontSize: "15px" }}>
              No reports published yet. Check back soon.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {reports.map((report) => {
              const typeLabel =
                REPORT_TYPE_LABELS[report.report_type as ReportType] ??
                report.report_type;
              return (
                <li
                  key={report.id}
                  style={{
                    borderBottom: "1px solid #E8DFD1",
                    padding: "24px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{
                      background: "#F5F0E8",
                      color: "#5A5347",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontWeight: 600,
                    }}>
                      {typeLabel}
                    </span>
                    <span style={{ fontSize: "12px", color: "#A09788" }}>
                      {timeAgo(report.published_at)}
                    </span>
                  </div>

                  <a
                    href={`/reports/${report.slug}`}
                    style={{
                      fontSize: "20px",
                      fontWeight: 600,
                      color: "#1A1815",
                      textDecoration: "none",
                      fontFamily: "var(--font-newsreader), Georgia, serif",
                      lineHeight: 1.3,
                      letterSpacing: "-0.01em",
                    }}
                    className="report-title-link"
                  >
                    {report.title}
                  </a>

                  <a
                    href={`/reports/${report.slug}`}
                    style={{
                      fontSize: "13px",
                      color: "#C44B2E",
                      textDecoration: "none",
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    Read report &rarr;
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer note */}
        {reports.length > 0 && (
          <p style={{ marginTop: "40px", fontSize: "12px", color: "#A09788" }}>
            Showing {reports.length} report{reports.length !== 1 ? "s" : ""}.
          </p>
        )}
      </div>

      <style>{`
        .report-title-link:hover {
          color: #C44B2E;
        }
      `}</style>
    </main>
  );
}

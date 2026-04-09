/**
 * PositioningEvidence — Fee positioning metrics for the Executive Briefing home screen.
 * Renders spotlight fee categories as stat cards with median, P25/P75, and institution count.
 * Server component — no "use client".
 */

import type { PositioningEntry } from "@/lib/hamilton/home-data";
import { formatAmount } from "@/lib/format";

interface PositioningEvidenceProps {
  entries: PositioningEntry[];
}

type MaturityTier = "strong" | "provisional" | "insufficient";

function MaturityBadge({ tier }: { tier: MaturityTier }) {
  const styles: Record<MaturityTier, { color: string; bg: string; label: string }> = {
    strong: { color: "#15803d", bg: "#f0fdf4", label: "Strong" },
    provisional: { color: "#b45309", bg: "#fffbeb", label: "Provisional" },
    insufficient: { color: "#78716c", bg: "#fafaf9", label: "Limited" },
  };
  const s = styles[tier];
  return (
    <span
      style={{
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: s.color,
        backgroundColor: s.bg,
        borderRadius: "9999px",
        padding: "0.125rem 0.5rem",
      }}
    >
      {s.label}
    </span>
  );
}

function StatCard({ entry }: { entry: PositioningEntry }) {
  const hasRange = entry.p25Amount !== null && entry.p75Amount !== null;

  return (
    <div
      className="hamilton-card"
      style={{
        padding: "1rem",
        minWidth: "10rem",
        flex: "1 1 10rem",
      }}
    >
      {/* Fee name */}
      <div
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hamilton-text-tertiary)",
          marginBottom: "0.5rem",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {entry.displayName}
      </div>

      {/* Median amount — large */}
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: "var(--hamilton-text-primary)",
          lineHeight: 1.1,
          marginBottom: "0.375rem",
        }}
      >
        {entry.medianAmount !== null ? formatAmount(entry.medianAmount) : "—"}
      </div>

      {/* P25–P75 range */}
      {hasRange && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--hamilton-text-tertiary)",
            marginBottom: "0.5rem",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          P25–P75: {formatAmount(entry.p25Amount)} — {formatAmount(entry.p75Amount)}
        </div>
      )}

      {/* Footer: institution count + maturity */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            color: "var(--hamilton-text-secondary)",
          }}
        >
          {entry.institutionCount.toLocaleString()} institutions
        </span>
        <MaturityBadge tier={entry.maturityTier} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "1.5rem",
        textAlign: "center",
        color: "var(--hamilton-text-secondary)",
        fontSize: "0.875rem",
      }}
    >
      Configure your institution in Settings to see positioning data.
    </div>
  );
}

export function PositioningEvidence({ entries }: PositioningEvidenceProps) {
  return (
    <div className="hamilton-card" style={{ padding: "1.5rem" }}>
      {/* Section header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--hamilton-text-secondary)",
          }}
        >
          Positioning Evidence
        </span>
        {entries.length > 0 && (
          <span
            style={{
              marginLeft: "0.75rem",
              fontSize: "0.7rem",
              color: "var(--hamilton-text-tertiary)",
            }}
          >
            {entries.length} spotlight categories
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {entries.map((entry) => (
            <StatCard key={entry.feeCategory} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

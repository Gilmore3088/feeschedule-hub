/**
 * PositioningEvidence — Fee positioning stat cards: Your Fee / Peer Median / Percentile.
 * Matches HTML prototype "Positioning Evidence" section exactly.
 * Server component — no "use client".
 */

import type { PositioningEntry } from "@/lib/hamilton/home-data";
import { formatAmount } from "@/lib/format";

interface PositioningEvidenceProps {
  entries: PositioningEntry[];
}

function EmptyState() {
  return (
    <div style={{ padding: "1.5rem 0", color: "var(--hamilton-on-surface-variant)", fontSize: "0.875rem" }}>
      Configure your institution in Settings to see positioning data.
    </div>
  );
}

function DefaultStats() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3rem" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="font-label"
          style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
        >
          Your Fee
        </span>
        <span
          className="font-headline"
          style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          $33.00
        </span>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--hamilton-primary)", marginTop: "0.5rem" }}>
          High Outlier
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="font-label"
          style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
        >
          Peer Median
        </span>
        <span
          className="font-headline"
          style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          $29.00
        </span>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--hamilton-on-surface-variant)", marginTop: "0.5rem" }}>
          Market Benchmark
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          className="font-label"
          style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
        >
          Percentile
        </span>
        <span
          className="font-headline"
          style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          88th
        </span>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--hamilton-error)", marginTop: "0.5rem" }}>
          Top Quartile Pricing (High Risk)
        </span>
      </div>
    </div>
  );
}

export function PositioningEvidence({ entries }: PositioningEvidenceProps) {
  const first = entries[0] ?? null;

  const yourFee = first?.medianAmount != null ? formatAmount(first.medianAmount) : null;
  const peerMedian = first?.p25Amount != null ? formatAmount(first.p25Amount) : null;

  return (
    <div
      className="editorial-shadow"
      style={{
        backgroundColor: "var(--hamilton-surface-container-lowest)",
        padding: "2rem",
        borderRadius: "var(--hamilton-radius-lg)",
      }}
    >
      <h3
        className="font-label"
        style={{
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--hamilton-on-surface-variant)",
          marginBottom: "2rem",
        }}
      >
        Positioning Evidence
      </h3>

      {entries.length === 0 ? (
        <DefaultStats />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3rem" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
            >
              Your Fee
            </span>
            <span
              className="font-headline"
              style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {yourFee ?? "—"}
            </span>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--hamilton-primary)", marginTop: "0.5rem" }}>
              High Outlier
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
            >
              Peer Median
            </span>
            <span
              className="font-headline"
              style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {peerMedian ?? "—"}
            </span>
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--hamilton-on-surface-variant)", marginTop: "0.5rem" }}>
              Market Benchmark
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hamilton-on-surface-variant)", marginBottom: "0.5rem" }}
            >
              Percentile
            </span>
            <span
              className="font-headline"
              style={{ fontSize: "2.25rem", color: "var(--hamilton-on-surface)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              88th
            </span>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--hamilton-error)", marginTop: "0.5rem" }}>
              Top Quartile Pricing (High Risk)
            </span>
          </div>
        </div>
      )}

      {/* Progress bar + distribution link */}
      <div
        style={{
          marginTop: "2rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(216, 194, 184, 0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: "28rem",
            height: "0.375rem",
            backgroundColor: "var(--hamilton-surface-container-high)",
            borderRadius: "9999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--hamilton-primary)",
              height: "100%",
              width: "88%",
            }}
          />
        </div>
        <a
          href="#"
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--hamilton-primary)",
            textDecoration: "none",
            marginLeft: "1.5rem",
            flexShrink: 0,
          }}
        >
          View full distribution &rarr;
        </a>
      </div>
    </div>
  );
}

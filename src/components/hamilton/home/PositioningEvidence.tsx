/**
 * PositioningEvidence — Fee positioning stat cards: Market Median / P25 / P75 / Maturity.
 * Renders exclusively from the entries prop — no hardcoded defaults.
 * Server component — no "use client".
 */

import type { PositioningEntry } from "@/lib/hamilton/home-data";
import { formatAmount } from "@/lib/format";

interface PositioningEvidenceProps {
  entries: PositioningEntry[];
}

const MATURITY_LABELS: Record<string, string> = {
  strong: "Strong Coverage",
  provisional: "Provisional",
  insufficient: "Insufficient Data",
};

const MATURITY_COLORS: Record<string, string> = {
  strong: "var(--hamilton-primary)",
  provisional: "var(--hamilton-on-surface-variant)",
  insufficient: "var(--hamilton-error)",
};

export function PositioningEvidence({ entries }: PositioningEvidenceProps) {
  const first = entries[0] ?? null;

  const marketMedian = first?.medianAmount != null ? formatAmount(first.medianAmount) : null;
  const p25 = first?.p25Amount != null ? formatAmount(first.p25Amount) : null;
  const p75 = first?.p75Amount != null ? formatAmount(first.p75Amount) : null;
  const maturityTier = first?.maturityTier ?? null;
  const institutionCount = first?.institutionCount ?? null;

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
        <p
          style={{
            fontSize: "0.875rem",
            lineHeight: 1.6,
            color: "var(--hamilton-on-surface-variant)",
            padding: "2rem 0",
            textAlign: "center",
            margin: 0,
          }}
        >
          Configure your institution in Settings to see positioning data
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3rem" }}>
          {/* Market Median */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--hamilton-on-surface-variant)",
                marginBottom: "0.5rem",
              }}
            >
              Market Median
            </span>
            <span
              className="font-headline"
              style={{
                fontSize: "2.25rem",
                color: "var(--hamilton-on-surface)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {marketMedian ?? "—"}
            </span>
            {institutionCount != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--hamilton-on-surface-variant)",
                  marginTop: "0.5rem",
                }}
              >
                {institutionCount} institutions
              </span>
            )}
          </div>

          {/* P25 / P75 Range */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--hamilton-on-surface-variant)",
                marginBottom: "0.5rem",
              }}
            >
              P25 — P75 Range
            </span>
            <span
              className="font-headline"
              style={{
                fontSize: "2.25rem",
                color: "var(--hamilton-on-surface)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {p25 ?? "—"}
            </span>
            {p75 != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--hamilton-on-surface-variant)",
                  marginTop: "0.5rem",
                }}
              >
                to {p75}
              </span>
            )}
          </div>

          {/* Coverage / Maturity */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              className="font-label"
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--hamilton-on-surface-variant)",
                marginBottom: "0.5rem",
              }}
            >
              Coverage
            </span>
            <span
              className="font-headline"
              style={{
                fontSize: "2.25rem",
                color: "var(--hamilton-on-surface)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {first?.displayName ?? "—"}
            </span>
            {maturityTier != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: MATURITY_COLORS[maturityTier] ?? "var(--hamilton-on-surface-variant)",
                  marginTop: "0.5rem",
                }}
              >
                {MATURITY_LABELS[maturityTier] ?? maturityTier}
              </span>
            )}
          </div>
        </div>
      )}

      {/* View full distribution link — only shown when real data is available */}
      {entries.length > 0 && (
        <div
          style={{
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid rgba(216, 194, 184, 0.2)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <a
            href="#"
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--hamilton-primary)",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            View full distribution &rarr;
          </a>
        </div>
      )}
    </div>
  );
}

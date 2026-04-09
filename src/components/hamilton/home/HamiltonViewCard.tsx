/**
 * HamiltonViewCard — Hamilton's View section for the Executive Briefing home screen.
 * Renders core thesis, tensions, narrative summary, and confidence indicator.
 * Server component — no "use client".
 */

import type { ThesisOutput } from "@/lib/hamilton/types";

interface HamiltonViewCardProps {
  thesis: ThesisOutput | null;
  confidence: "high" | "medium" | "low";
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  if (confidence === "high") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          fontSize: "0.7rem",
          fontWeight: 500,
          color: "#15803d",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: "9999px",
          padding: "0.125rem 0.625rem",
        }}
      >
        <span
          style={{
            width: "0.5rem",
            height: "0.5rem",
            borderRadius: "50%",
            backgroundColor: "#16a34a",
            flexShrink: 0,
          }}
        />
        High confidence
      </span>
    );
  }

  if (confidence === "medium") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          fontSize: "0.7rem",
          fontWeight: 500,
          color: "#b45309",
          backgroundColor: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: "9999px",
          padding: "0.125rem 0.625rem",
        }}
      >
        <span
          style={{
            width: "0.5rem",
            height: "0.5rem",
            borderRadius: "50%",
            backgroundColor: "#d97706",
            flexShrink: 0,
          }}
        />
        Moderate confidence
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.7rem",
        fontWeight: 500,
        color: "#78716c",
        backgroundColor: "#fafaf9",
        border: "1px solid #e7e5e4",
        borderRadius: "9999px",
        padding: "0.125rem 0.625rem",
      }}
    >
      <span
        style={{
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          backgroundColor: "#a8a29e",
          flexShrink: 0,
        }}
      />
      Limited data
    </span>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "2rem 0",
        color: "var(--hamilton-text-secondary)",
      }}
    >
      <div
        style={{
          width: "3rem",
          height: "3rem",
          margin: "0 auto 1rem",
          borderRadius: "50%",
          backgroundColor: "var(--hamilton-surface-sunken)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <p
        style={{
          fontSize: "0.9375rem",
          fontFamily: "var(--hamilton-font-serif)",
          color: "var(--hamilton-text-secondary)",
          marginBottom: "0.375rem",
        }}
      >
        Hamilton is preparing your first briefing
      </p>
      <p style={{ fontSize: "0.8125rem", color: "var(--hamilton-text-tertiary)" }}>
        Analysis will appear here once the index has sufficient data.
      </p>
    </div>
  );
}

export function HamiltonViewCard({ thesis, confidence }: HamiltonViewCardProps) {
  return (
    <div className="hamilton-card" style={{ padding: "1.5rem" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.25rem",
        }}
      >
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--hamilton-text-secondary)",
          }}
        >
          Hamilton&apos;s View
        </span>
        <ConfidenceBadge confidence={confidence} />
      </div>

      {thesis === null ? (
        <EmptyState />
      ) : (
        <>
          {/* Core thesis */}
          <p
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              fontSize: "1.1875rem",
              lineHeight: 1.55,
              color: "var(--hamilton-text-primary)",
              marginBottom: "1rem",
            }}
          >
            {thesis.core_thesis}
          </p>

          {/* Divider */}
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--hamilton-border)",
              marginBottom: "1rem",
            }}
          />

          {/* Narrative summary */}
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.65,
              color: "var(--hamilton-text-secondary)",
              marginBottom: thesis.tensions.length > 0 ? "1.25rem" : 0,
            }}
          >
            {thesis.narrative_summary}
          </p>

          {/* Tensions */}
          {thesis.tensions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--hamilton-text-tertiary)",
                  marginBottom: "0.25rem",
                }}
              >
                Key Tensions
              </span>
              {thesis.tensions.map((tension, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.8125rem",
                    lineHeight: 1.55,
                    color: "var(--hamilton-text-secondary)",
                    paddingLeft: "0.875rem",
                    borderLeft: "2px solid var(--hamilton-accent-subtle)",
                  }}
                >
                  <span style={{ color: "var(--hamilton-text-accent)", fontWeight: 500 }}>
                    {tension.force_a}
                  </span>
                  <span style={{ color: "var(--hamilton-text-tertiary)" }}> while </span>
                  <span style={{ color: "var(--hamilton-text-accent)", fontWeight: 500 }}>
                    {tension.force_b}
                  </span>
                  <span style={{ color: "var(--hamilton-text-secondary)" }}>
                    {" "}— {tension.implication}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

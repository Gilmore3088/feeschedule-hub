/**
 * PriorityAlertCard — Top active alert with severity badge and recommended next move.
 * Server component — no "use client".
 * Reuses SeverityBadge pattern from home/PriorityAlertsCard.tsx.
 */

import Link from "next/link";
import type { AlertEntry } from "@/lib/hamilton/home-data";

interface PriorityAlertCardProps {
  alert: AlertEntry | null;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styleMap: Record<string, { bg: string; color: string }> = {
    high: { bg: "#fef2f2", color: "#b91c1c" },
    medium: { bg: "#fffbeb", color: "#b45309" },
    low: { bg: "#eff6ff", color: "#1d4ed8" },
  };
  const { bg, color } = styleMap[severity.toLowerCase()] ?? {
    bg: "#f5f5f4",
    color: "#78716c",
  };

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        backgroundColor: bg,
        color,
        borderRadius: "9999px",
        padding: "0.125rem 0.5rem",
        flexShrink: 0,
      }}
    >
      {severity}
    </span>
  );
}

function EmptyState() {
  return (
    <p
      style={{
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        color: "var(--hamilton-text-secondary)",
        padding: "1rem 0",
      }}
    >
      No active alerts. Hamilton is monitoring your competitive position.
    </p>
  );
}

export function PriorityAlertCard({ alert }: PriorityAlertCardProps) {
  return (
    <div className="hamilton-card" style={{ padding: "1.25rem" }}>
      {/* Section label */}
      <span
        style={{
          display: "block",
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--hamilton-text-secondary)",
          marginBottom: "1rem",
        }}
      >
        Priority Alert
      </span>

      {!alert ? (
        <EmptyState />
      ) : (
        <div>
          {/* Severity + title row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              marginBottom: "0.5rem",
            }}
          >
            <SeverityBadge severity={alert.severity} />
            <span
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "var(--hamilton-text-primary)",
                lineHeight: 1.35,
              }}
            >
              {alert.title}
            </span>
          </div>

          {/* Impact / body */}
          <p
            style={{
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              color: "var(--hamilton-text-secondary)",
              marginBottom: "0.875rem",
            }}
          >
            {alert.body}
          </p>

          {/* Recommended next move CTA */}
          <Link
            href="/pro/analyze"
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "var(--hamilton-text-accent)",
              textDecoration: "none",
            }}
          >
            Recommended next move &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * PriorityAlertsCard — Top 3 active alerts ranked by severity.
 * Server component — no "use client".
 * Per copy rules: section label is "Priority Alerts".
 */

import type { AlertEntry } from "@/lib/hamilton/home-data";

interface PriorityAlertsCardProps {
  alerts: AlertEntry[];
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
      No current alerts. Hamilton is monitoring your competitive position.
    </p>
  );
}

export function PriorityAlertsCard({ alerts }: PriorityAlertsCardProps) {
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
        Priority Alerts
      </span>

      {alerts.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {alerts.map((alert) => (
            <div key={alert.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.25rem",
                }}
              >
                <SeverityBadge severity={alert.severity} />
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--hamilton-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {alert.title}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--hamilton-text-secondary)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {alert.body}
                </p>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--hamilton-text-accent)",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                >
                  Review
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

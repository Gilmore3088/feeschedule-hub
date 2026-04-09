/**
 * WhatChangedCard — Recent fee movements and regulatory signals.
 * Server component — no "use client".
 * Per copy rules: section label is "What Changed".
 */

import { timeAgo } from "@/lib/format";
import type { SignalEntry } from "@/lib/hamilton/home-data";

interface WhatChangedCardProps {
  signals: SignalEntry[];
}

function SeverityDot({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    high: "#dc2626",
    medium: "#d97706",
    low: "#3b82f6",
  };
  const color = colorMap[severity.toLowerCase()] ?? "#a8a29e";
  return (
    <span
      style={{
        display: "inline-block",
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        marginTop: "0.25rem",
      }}
    />
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
      No recent changes detected. Hamilton monitors fee movements and regulatory
      signals continuously.
    </p>
  );
}

export function WhatChangedCard({ signals }: WhatChangedCardProps) {
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
        What Changed
      </span>

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {signals.map((signal) => (
            <div
              key={signal.id}
              style={{
                display: "flex",
                gap: "0.625rem",
                alignItems: "flex-start",
              }}
            >
              <SeverityDot severity={signal.severity} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--hamilton-text-primary)",
                    marginBottom: "0.125rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {signal.title}
                </p>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--hamilton-text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {signal.body}
                </p>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--hamilton-text-tertiary)",
                  flexShrink: 0,
                  marginTop: "0.125rem",
                }}
              >
                {timeAgo(signal.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

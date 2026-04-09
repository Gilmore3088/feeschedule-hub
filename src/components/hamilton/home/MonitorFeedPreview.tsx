/**
 * MonitorFeedPreview — Last 3 signals in compact timeline format.
 * Server component — no "use client".
 * Per copy rules: section label is "Monitor Feed".
 * Links to /pro/monitor for full feed.
 */

import Link from "next/link";
import { timeAgo } from "@/lib/format";
import type { SignalEntry } from "@/lib/hamilton/home-data";

interface MonitorFeedPreviewProps {
  signals: SignalEntry[];
}

function SignalTypeLabel({ signalType }: { signalType: string }) {
  const label = signalType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      style={{
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--hamilton-text-accent)",
      }}
    >
      {label}
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
      No signals yet. As Hamilton detects fee movements and regulatory changes,
      they will appear here.
    </p>
  );
}

export function MonitorFeedPreview({ signals }: MonitorFeedPreviewProps) {
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
        Monitor Feed
      </span>

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {signals.map((signal, index) => (
            <div
              key={signal.id}
              style={{
                display: "flex",
                gap: "0.875rem",
                paddingBottom: index < signals.length - 1 ? "0.875rem" : 0,
                paddingTop: index > 0 ? "0" : 0,
              }}
            >
              {/* Left accent border / timeline line */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "2px",
                    backgroundColor: "var(--hamilton-accent-subtle)",
                    flex: 1,
                    minHeight: "2.5rem",
                    borderRadius: "1px",
                  }}
                />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: "0.25rem" }}>
                <SignalTypeLabel signalType={signal.signalType} />
                <p
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--hamilton-text-primary)",
                    marginTop: "0.125rem",
                    marginBottom: "0.125rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {signal.title}
                </p>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--hamilton-text-tertiary)",
                  }}
                >
                  {timeAgo(signal.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View all link */}
      <div
        style={{
          marginTop: "0.875rem",
          paddingTop: "0.875rem",
          borderTop: "1px solid var(--hamilton-border)",
        }}
      >
        <Link
          href="/pro/monitor"
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "var(--hamilton-text-accent)",
            textDecoration: "none",
          }}
        >
          View all signals &rarr;
        </Link>
      </div>
    </div>
  );
}

/**
 * SignalFeed — Full reverse-chronological signal timeline.
 * Server component — no "use client".
 * Bloomberg terminal feed aesthetic with left-border severity indicators.
 * Extends MonitorFeedPreview (home screen compact version) into a full-page timeline.
 */

import { timeAgo } from "@/lib/format";
import type { SignalEntry } from "@/lib/hamilton/home-data";

interface SignalFeedProps {
  signals: SignalEntry[];
}

const SEVERITY_ACCENT: Record<string, string> = {
  high: "#b91c1c",
  medium: "#b45309",
  low: "#1d4ed8",
};

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

export function SignalFeed({ signals }: SignalFeedProps) {
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
        Signal Feed
      </span>

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {signals.map((signal, index) => {
            const accentColor =
              SEVERITY_ACCENT[signal.severity.toLowerCase()] ??
              SEVERITY_ACCENT.low;
            const isLast = index === signals.length - 1;

            return (
              <div
                key={signal.id}
                style={{
                  display: "flex",
                  gap: "0.875rem",
                  paddingBottom: isLast ? 0 : "1rem",
                  marginBottom: isLast ? 0 : "1rem",
                  borderBottom: isLast
                    ? "none"
                    : "1px solid var(--hamilton-border)",
                }}
              >
                {/* Left severity accent bar */}
                <div
                  style={{
                    width: "2px",
                    backgroundColor: accentColor,
                    borderRadius: "1px",
                    flexShrink: 0,
                    alignSelf: "stretch",
                    minHeight: "3rem",
                  }}
                />

                {/* Signal content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SignalTypeLabel signalType={signal.signalType} />

                  <p
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--hamilton-text-primary)",
                      marginTop: "0.125rem",
                      marginBottom: "0.25rem",
                      lineHeight: 1.4,
                    }}
                  >
                    {signal.title}
                  </p>

                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--hamilton-text-secondary)",
                      lineHeight: 1.5,
                      marginBottom: "0.375rem",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {signal.body}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * MonitorFeedPreview — Timeline feed matching HTML prototype "Hamilton Monitor Feed" section.
 * Full-width card with vertical timeline line, signal cards, and timestamps.
 * Server component — no "use client".
 */

import Link from "next/link";
import { timeAgo } from "@/lib/format";
import type { SignalEntry } from "@/lib/hamilton/home-data";

interface MonitorFeedPreviewProps {
  signals: SignalEntry[];
}

interface DefaultFeedItem {
  dot: string;
  title: string;
  body: string;
  time: string;
}

const DEFAULT_FEED: DefaultFeedItem[] = [
  {
    dot: "primary",
    title: "Insight Generated — Regulatory Focus",
    body: "CFPB release confirms focus on junk fees for institutions above $10B. Hamilton recommends an immediate audit of non-interest income streams to mitigate audit risk.",
    time: "11:04 AM",
  },
  {
    dot: "variant",
    title: "Market Shift — Pricing Pressure Increasing",
    body: 'Local peer "Heritage First" has dropped their overdraft cap by 25%. This signal suggests a competitive shift that may lead to customer churn in your primary retail segments.',
    time: "09:15 AM",
  },
];

function EmptyState() {
  return (
    <p
      style={{
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        color: "var(--hamilton-on-surface-variant)",
        padding: "1rem 0",
      }}
    >
      No signals yet. As Hamilton detects fee movements and regulatory changes, they will appear here.
    </p>
  );
}

export function MonitorFeedPreview({ signals }: MonitorFeedPreviewProps) {
  const hasSignals = signals.length > 0;

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
        Hamilton Monitor Feed
      </h3>

      {/* Timeline */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: "0.6875rem",
            top: "0.5rem",
            bottom: "0.5rem",
            width: "1px",
            backgroundColor: "rgba(216, 194, 184, 0.3)",
          }}
        />

        {!hasSignals
          ? DEFAULT_FEED.map((item, i) => (
              <div key={i} style={{ position: "relative", paddingLeft: "2.5rem" }}>
                {/* Timeline dot */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "0.25rem",
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    border: "1px solid rgba(216, 194, 184, 0.2)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <span
                    style={{
                      width: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "50%",
                      backgroundColor:
                        item.dot === "primary"
                          ? "var(--hamilton-primary)"
                          : "var(--hamilton-on-surface-variant)",
                      flexShrink: 0,
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: "1rem" }}>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        color: "var(--hamilton-on-surface)",
                        margin: "0 0 0.25rem 0",
                      }}
                    >
                      {item.title}
                    </p>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--hamilton-on-surface-variant)",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {item.body}
                    </p>
                  </div>
                  <span
                    className="font-label"
                    style={{
                      fontSize: "0.625rem",
                      color: "var(--hamilton-on-surface-variant)",
                      textTransform: "uppercase",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.time}
                  </span>
                </div>
              </div>
            ))
          : signals.map((signal, i) => (
              <div key={signal.id} style={{ position: "relative", paddingLeft: "2.5rem" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "0.25rem",
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    border: "1px solid rgba(216, 194, 184, 0.2)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <span
                    style={{
                      width: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "50%",
                      backgroundColor:
                        i === 0 ? "var(--hamilton-primary)" : "var(--hamilton-on-surface-variant)",
                      flexShrink: 0,
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: "1rem" }}>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        color: "var(--hamilton-on-surface)",
                        margin: "0 0 0.25rem 0",
                      }}
                    >
                      {signal.title}
                    </p>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--hamilton-on-surface-variant)",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {signal.body}
                    </p>
                  </div>
                  <span
                    className="font-label"
                    style={{
                      fontSize: "0.625rem",
                      color: "var(--hamilton-on-surface-variant)",
                      textTransform: "uppercase",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {timeAgo(signal.createdAt)}
                  </span>
                </div>
              </div>
            ))}
      </div>

      {/* View all link */}
      <div
        style={{
          marginTop: "1.5rem",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(216, 194, 184, 0.2)",
        }}
      >
        <Link
          href="/pro/monitor"
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            color: "var(--hamilton-primary)",
            textDecoration: "none",
          }}
        >
          View all signals &rarr;
        </Link>
      </div>
    </div>
  );
}

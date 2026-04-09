/**
 * WhatChangedCard — 3-pill "What Changed" strip: Market Move, Peer Shift, Local Trend.
 * Matches HTML prototype "What Changed Row" grid structure.
 * Server component — no "use client".
 */

import { timeAgo } from "@/lib/format";
import type { SignalEntry } from "@/lib/hamilton/home-data";

interface WhatChangedCardProps {
  signals: SignalEntry[];
}

function SignalTypeLabel({ label }: { label: string }) {
  return (
    <span
      className="font-label"
      style={{
        fontSize: "0.625rem",
        fontWeight: 700,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "var(--hamilton-on-surface-variant)",
      }}
    >
      {label}
    </span>
  );
}

export function WhatChangedCard({ signals }: WhatChangedCardProps) {
  if (signals.length === 0) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <div
          style={{
            gridColumn: "1 / -1",
            padding: "2rem 0",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "var(--hamilton-on-surface-variant)",
              margin: 0,
            }}
          >
            Configure your watchlist to see fee changes here
          </p>
        </div>
      </div>
    );
  }

  const labelMap: Record<string, { label: string; bg: string; emoji: string }> = {
    market_move: { label: "Market Move", bg: "#f0f2f5", emoji: "↘" },
    peer_shift: { label: "Peer Shift", bg: "#f5f0ee", emoji: "⬡" },
    local_trend: { label: "Local Trend", bg: "#eef5f2", emoji: "⚠" },
  };

  const displayed = signals.slice(0, 3);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
      {displayed.map((signal) => {
        const meta = labelMap[signal.signalType] ?? { label: signal.signalType, bg: "#f5f3ee", emoji: "•" };
        return (
          <div
            key={signal.id}
            style={{
              padding: "1rem",
              backgroundColor: meta.bg,
              borderRadius: "var(--hamilton-radius-lg)",
              border: "1px solid rgba(216, 194, 184, 0.2)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.125rem" }}>{meta.emoji}</span>
              <SignalTypeLabel label={meta.label} />
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--hamilton-on-surface)",
                margin: 0,
              }}
            >
              {signal.title}
            </p>
            <span
              style={{
                marginTop: "0.5rem",
                fontSize: "0.6875rem",
                color: "var(--hamilton-text-tertiary)",
              }}
            >
              {timeAgo(signal.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

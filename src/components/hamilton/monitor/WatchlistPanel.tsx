/**
 * WatchlistPanel — Right sidebar matching HTML prototype.
 * Sections:
 *   1. WATCHLIST INTEGRITY — tracked institutions with status dots
 *   2. FEE MOVEMENTS — Custodial Premium / Management Alpha / Advisory Spread
 *   3. Branded card — "Recurring Value preserves institutional permanence"
 *
 * Interactive add/remove is a client sub-component.
 */

"use client";

import { useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/app/pro/(hamilton)/monitor/actions";
import type { WatchlistEntry } from "@/lib/hamilton/monitor-data";

interface WatchlistPanelProps {
  entries: WatchlistEntry[];
  userId: number;
}

// ---------------------------------------------------------------------------
// Status config matching prototype icons
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  WatchlistEntry["status"],
  { icon: React.ReactNode; label: string }
> = {
  current: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#16a34a",
          lineHeight: 1,
        }}
        title="Renewal status: Secure"
      >
        ✓
      </span>
    ),
    label: "RENEWAL STATUS: SECURE",
  },
  review_due: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#b45309",
          lineHeight: 1,
        }}
        title="Renewal status: In Review"
      >
        ◷
      </span>
    ),
    label: "RENEWAL STATUS: IN REVIEW",
  },
  unknown: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#a8a29e",
          lineHeight: 1,
        }}
        title="Renewal status: Unknown"
      >
        ○
      </span>
    ),
    label: "RENEWAL STATUS: UNKNOWN",
  },
};

// ---------------------------------------------------------------------------
// Static fee movements data (prototype-matched)
// ---------------------------------------------------------------------------

const FEE_MOVEMENTS = [
  {
    label: "Custodial Premium",
    value: "+12.4%",
    badge: "Bullish Drift",
    badgeBg: "#f0fdf4",
    badgeColor: "#15803d",
  },
  {
    label: "Management Alpha",
    value: "-3.1%",
    badge: "Erosion Risk",
    badgeBg: "#fffbeb",
    badgeColor: "#b45309",
  },
  {
    label: "Advisory Spread",
    value: "STABLE",
    badge: "Base Case",
    badgeBg: "#f5f5f4",
    badgeColor: "#57534e",
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WatchlistIntegrity({
  entries,
  onRemove,
  isPending,
}: {
  entries: WatchlistEntry[];
  onRemove: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        Watchlist Integrity
      </h2>

      {entries.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.875rem",
            color: "var(--hamilton-text-secondary)",
            lineHeight: 1.6,
            paddingBottom: "0.5rem",
          }}
        >
          No institutions tracked. Add one below to begin monitoring.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {entries.map((entry) => {
            const { icon, label } = STATUS_CONFIG[entry.status];
            return (
              <div
                key={entry.institutionId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  backgroundColor: "var(--hamilton-surface-container-low, #f5f3ee)",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                className="watchlist-row-hover"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--hamilton-on-surface)",
                      marginBottom: "0.125rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.displayName}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.625rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--hamilton-text-tertiary)",
                    }}
                  >
                    {label}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                  {icon}
                  <button
                    onClick={() => onRemove(entry.institutionId)}
                    disabled={isPending}
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--hamilton-text-tertiary)",
                      background: "none",
                      border: "none",
                      cursor: isPending ? "not-allowed" : "pointer",
                      padding: 0,
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeeMovements() {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        Fee Movements
      </h2>

      <div
        style={{
          backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {FEE_MOVEMENTS.map((item, index) => {
          const isLast = index === FEE_MOVEMENTS.length - 1;
          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                paddingBottom: isLast ? 0 : "1rem",
                borderBottom: isLast
                  ? "none"
                  : "1px solid var(--hamilton-outline-variant, #d8c2b8)",
              }}
            >
              <div>
                <p
                  className="font-label"
                  style={{
                    fontFamily: "var(--hamilton-font-sans)",
                    fontSize: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--hamilton-text-tertiary)",
                    marginBottom: "0.125rem",
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </p>
                <p
                  className="font-headline"
                  style={{
                    fontFamily: "var(--hamilton-font-serif)",
                    fontSize: "1.875rem",
                    color: "var(--hamilton-on-surface)",
                    lineHeight: 1.1,
                  }}
                >
                  {item.value}
                </p>
              </div>

              <span
                style={{
                  fontSize: "0.625rem",
                  fontFamily: "var(--hamilton-font-sans)",
                  padding: "0.25rem 0.5rem",
                  backgroundColor: item.badgeBg,
                  color: item.badgeColor,
                  borderRadius: "9999px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {item.badge}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrandedCard() {
  return (
    <div
      style={{
        position: "relative",
        height: "12rem",
        overflow: "hidden",
        borderRadius: "var(--hamilton-radius-lg, 0.5rem)",
        backgroundColor: "var(--hamilton-primary)",
      }}
    >
      {/* Overlay content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(138,76,39,0.7) 0%, rgba(138,76,39,0.95) 100%)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <p
          className="font-headline"
          style={{
            fontFamily: "var(--hamilton-font-serif)",
            fontSize: "1.125rem",
            color: "#ffffff",
            lineHeight: 1.35,
            marginBottom: "0.5rem",
          }}
        >
          Recurring Value preserves institutional permanence.
        </p>
        <p
          className="font-label"
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Hamilton Strategy Protocol
        </p>
      </div>
    </div>
  );
}

function AddInstitutionInput({
  value,
  onChange,
  onAdd,
  isPending,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <div
      style={{
        paddingTop: "1rem",
        borderTop: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Institution ID or name"
          disabled={isPending}
          style={{
            flex: 1,
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.8125rem",
            padding: "0.5rem 0.75rem",
            border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
            borderRadius: "var(--hamilton-radius-md, 0.25rem)",
            backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
            color: "var(--hamilton-on-surface)",
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          onClick={onAdd}
          disabled={isPending || !value.trim()}
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "0.5rem 1rem",
            background:
              "linear-gradient(to bottom right, var(--hamilton-primary), var(--hamilton-primary-container))",
            color: "#ffffff",
            border: "none",
            borderRadius: "var(--hamilton-radius-md, 0.25rem)",
            cursor: isPending || !value.trim() ? "not-allowed" : "pointer",
            opacity: isPending || !value.trim() ? 0.6 : 1,
            flexShrink: 0,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Watch
        </button>
      </div>
      {error && (
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.75rem",
            color: "var(--hamilton-error, #ba1a1a)",
            marginTop: "0.375rem",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WatchlistPanel({ entries: initialEntries, userId }: WatchlistPanelProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const id = inputValue.trim();
    if (!id) return;
    if (entries.some((e) => e.institutionId === id)) {
      setError("Already tracking this institution.");
      return;
    }
    setError(null);

    const newEntry: WatchlistEntry = {
      institutionId: id,
      displayName: id
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      status: "unknown",
    };
    setEntries((prev) => [...prev, newEntry]);
    setInputValue("");

    startTransition(() => {
      addToWatchlist(userId, id).catch(() => {
        setEntries((prev) => prev.filter((e) => e.institutionId !== id));
        setError("Failed to add institution. Please try again.");
      });
    });
  }

  function handleRemove(institutionId: string) {
    setEntries((prev) => prev.filter((e) => e.institutionId !== institutionId));
    startTransition(() => {
      removeFromWatchlist(userId, institutionId).catch(() => {
        setError("Failed to remove institution. Please refresh.");
      });
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* 1. Watchlist Integrity */}
      <WatchlistIntegrity
        entries={entries}
        onRemove={handleRemove}
        isPending={isPending}
      />

      {/* Add institution input */}
      <AddInstitutionInput
        value={inputValue}
        onChange={setInputValue}
        onAdd={handleAdd}
        isPending={isPending}
        error={error}
      />

      {/* 2. Fee Movements */}
      <FeeMovements />

      {/* 3. Branded card */}
      <BrandedCard />
    </div>
  );
}

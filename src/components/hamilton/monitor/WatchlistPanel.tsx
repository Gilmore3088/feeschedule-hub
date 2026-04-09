/**
 * WatchlistPanel — Tracked institutions with status indicators.
 * Shell is a server component; interactive add/remove is a client sub-component.
 */

"use client";

import { useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/app/pro/(hamilton)/monitor/actions";
import type { WatchlistEntry } from "@/lib/hamilton/monitor-data";

interface WatchlistPanelProps {
  entries: WatchlistEntry[];
  userId: number;
}

const STATUS_ICONS: Record<
  WatchlistEntry["status"],
  { icon: string; color: string; label: string }
> = {
  current: { icon: "✓", color: "#16a34a", label: "Current" },
  review_due: { icon: "!", color: "#b45309", label: "Review Due" },
  unknown: { icon: "○", color: "#a8a29e", label: "Unknown" },
};

function EmptyState() {
  return (
    <p
      style={{
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        color: "var(--hamilton-text-secondary)",
        padding: "0.5rem 0 1rem",
      }}
    >
      No institutions tracked. Add an institution below to monitor its fee
      movements.
    </p>
  );
}

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

    // Optimistic update
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
        // Rollback optimistic update on failure
        setEntries((prev) => prev.filter((e) => e.institutionId !== id));
        setError("Failed to add institution. Please try again.");
      });
    });
  }

  function handleRemove(institutionId: string) {
    // Optimistic update
    setEntries((prev) => prev.filter((e) => e.institutionId !== institutionId));

    startTransition(() => {
      removeFromWatchlist(userId, institutionId).catch(() => {
        // We don't have the original entry anymore — just show an error
        setError("Failed to remove institution. Please refresh.");
      });
    });
  }

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
        Watchlist
      </span>

      {/* Entry list */}
      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {entries.map((entry, index) => {
            const { icon, color, label } = STATUS_ICONS[entry.status];
            const isLast = index === entries.length - 1;

            return (
              <div
                key={entry.institutionId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  paddingBottom: isLast ? 0 : "0.75rem",
                  marginBottom: isLast ? 0 : "0.75rem",
                  borderBottom: isLast ? "none" : "1px solid var(--hamilton-border)",
                }}
              >
                {/* Status icon */}
                <span
                  title={label}
                  style={{
                    fontSize: "0.875rem",
                    color,
                    flexShrink: 0,
                    width: "1rem",
                    textAlign: "center",
                  }}
                >
                  {icon}
                </span>

                {/* Institution name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--hamilton-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.displayName}
                </span>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(entry.institutionId)}
                  disabled={isPending}
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--hamilton-text-tertiary)",
                    background: "none",
                    border: "none",
                    cursor: isPending ? "not-allowed" : "pointer",
                    padding: "0",
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add institution input */}
      <div
        style={{
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--hamilton-border)",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Institution ID or name"
          disabled={isPending}
          style={{
            flex: 1,
            fontSize: "0.8125rem",
            padding: "0.375rem 0.625rem",
            border: "1px solid var(--hamilton-border)",
            borderRadius: "0.375rem",
            backgroundColor: "var(--hamilton-surface-1)",
            color: "var(--hamilton-text-primary)",
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !inputValue.trim()}
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--hamilton-text-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor: isPending || !inputValue.trim() ? "not-allowed" : "pointer",
            opacity: isPending || !inputValue.trim() ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          Watch
        </button>
      </div>

      {error && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "#b91c1c",
            marginTop: "0.375rem",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

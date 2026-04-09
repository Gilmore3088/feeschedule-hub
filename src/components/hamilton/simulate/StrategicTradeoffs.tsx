"use client";

import type { TradeoffDeltas } from "@/lib/hamilton/simulation";

interface Props {
  tradeoffs: TradeoffDeltas | null;
}

export function StrategicTradeoffs({ tradeoffs }: Props) {
  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: "var(--hamilton-border)",
        background: "var(--hamilton-surface-elevated)",
      }}
    >
      <div
        className="px-4 py-2.5 border-b"
        style={{ borderColor: "var(--hamilton-border)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Strategic Tradeoffs
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--hamilton-border)" }}>
        {tradeoffs === null ? (
          // Skeleton loading state
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="flex flex-col items-end gap-1">
                  <div className="skeleton h-3 w-20 rounded" />
                  <div className="skeleton h-2.5 w-28 rounded" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {[tradeoffs.revenueImpact, tradeoffs.riskMitigation, tradeoffs.operationalImpact].map(
              (row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between px-4 py-3 gap-4"
                >
                  <span
                    className="text-xs font-semibold uppercase tracking-wider flex-shrink-0"
                    style={{ color: "var(--hamilton-text-tertiary)" }}
                  >
                    {row.label}
                  </span>
                  <div className="text-right">
                    <div
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: "var(--hamilton-text-primary)" }}
                    >
                      {row.value}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--hamilton-text-secondary)" }}
                    >
                      {row.note}
                    </div>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { FeePosition } from "@/lib/hamilton/simulation";

interface Props {
  feeCategory: string;
  currentFee: number;
  proposedFee: number;
  currentPosition: FeePosition;
  proposedPosition: FeePosition;
}

const RISK_STYLES: Record<"low" | "medium" | "high", { bg: string; text: string; label: string }> = {
  low: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Low Risk" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Medium Risk" },
  high: { bg: "bg-red-50", text: "text-red-700", label: "High Risk" },
};

function RiskBadge({ profile }: { profile: "low" | "medium" | "high" }) {
  const s = RISK_STYLES[profile];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function formatDollar(v: number): string {
  return `$${v.toFixed(2)}`;
}

function formatGap(gap: number): string {
  const sign = gap >= 0 ? "+" : "";
  return `${sign}${formatDollar(gap)} vs median`;
}

export function CurrentVsProposed({
  feeCategory: _feeCategory,
  currentFee,
  proposedFee,
  currentPosition,
  proposedPosition,
}: Props) {
  const percentileDelta = proposedPosition.percentile - currentPosition.percentile;
  const gapDelta = proposedPosition.medianGap - currentPosition.medianGap;
  const hasChange = proposedFee !== currentFee;

  const DeltaIcon =
    percentileDelta > 0 ? TrendingUp : percentileDelta < 0 ? TrendingDown : Minus;
  const deltaColor =
    percentileDelta < 0
      ? "text-emerald-600"
      : percentileDelta > 0
      ? "text-red-500"
      : "text-gray-400";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Current position card */}
        <div
          className="rounded-lg border p-4 flex flex-col gap-2"
          style={{
            background: "var(--hamilton-surface-elevated)",
            borderColor: "var(--hamilton-border)",
          }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-tertiary)" }}
          >
            Current Position
          </span>
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: "var(--hamilton-text-primary)" }}
          >
            {formatDollar(currentFee)}
          </div>
          <div className="text-lg font-semibold text-slate-600">
            P{currentPosition.percentile}
          </div>
          <div className="text-sm" style={{ color: "var(--hamilton-text-secondary)" }}>
            {formatGap(currentPosition.medianGap)}
          </div>
          <RiskBadge profile={currentPosition.riskProfile} />
        </div>

        {/* Proposed position card */}
        <div
          className="rounded-lg border p-4 flex flex-col gap-2 transition-all"
          style={{
            background: hasChange
              ? "var(--hamilton-accent-subtle)"
              : "var(--hamilton-surface-elevated)",
            borderColor: hasChange ? "var(--hamilton-accent)" : "var(--hamilton-border)",
          }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-tertiary)" }}
          >
            Proposed Position
          </span>
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: hasChange ? "var(--hamilton-accent)" : "var(--hamilton-text-primary)" }}
          >
            {formatDollar(proposedFee)}
          </div>
          <div className="text-lg font-semibold" style={{ color: hasChange ? "var(--hamilton-accent)" : "var(--color-slate-600)" }}>
            P{proposedPosition.percentile}
          </div>
          <div className="text-sm" style={{ color: "var(--hamilton-text-secondary)" }}>
            {formatGap(proposedPosition.medianGap)}
          </div>
          <RiskBadge profile={proposedPosition.riskProfile} />
        </div>
      </div>

      {/* Delta row */}
      {hasChange && (
        <div
          className="flex items-center gap-3 rounded-md px-4 py-2.5"
          style={{ background: "var(--hamilton-surface-sunken)" }}
        >
          <DeltaIcon className={`h-4 w-4 flex-shrink-0 ${deltaColor}`} />
          <div className="flex gap-4 text-sm">
            <span className={`font-semibold tabular-nums ${deltaColor}`}>
              {percentileDelta > 0 ? "+" : ""}
              {percentileDelta} percentile pts
            </span>
            <span style={{ color: "var(--hamilton-text-secondary)" }}>
              {gapDelta >= 0 ? "+" : ""}
              {formatDollar(gapDelta)} median gap
            </span>
            {proposedPosition.riskProfile !== currentPosition.riskProfile && (
              <span style={{ color: "var(--hamilton-text-secondary)" }}>
                {currentPosition.riskProfile} → {proposedPosition.riskProfile}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

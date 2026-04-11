"use client";

import { timeAgo } from "@/lib/format";

export interface ScenarioListItem {
  id: string;
  fee_category: string;
  current_value: string;
  proposed_value: string;
  confidence_tier: string;
  created_at: string;
}

interface Props {
  scenarios: ScenarioListItem[];
  selectedId?: string | null;
  onSelect: (scenario: ScenarioListItem) => void;
}

const TIER_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  strong: { label: "Strong", bg: "var(--hamilton-accent-subtle)", text: "var(--hamilton-accent)" },
  provisional: { label: "Provisional", bg: "rgb(255 251 235)", text: "rgb(146 64 14)" },
  insufficient: { label: "Insufficient", bg: "rgb(254 226 226)", text: "rgb(153 27 27)" },
};

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDollar(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return `$${n.toFixed(2)}`;
}

export function ScenarioArchive({ scenarios, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--hamilton-text-tertiary)" }}
      >
        Saved Scenarios
      </span>

      {scenarios.length === 0 ? (
        <p
          className="text-sm"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          No saved scenarios yet. Run a simulation to create your first.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scenarios.map((scenario) => {
            const badge = TIER_BADGE[scenario.confidence_tier] ?? TIER_BADGE.provisional;
            const isActive = selectedId === scenario.id;

            return (
              <button
                key={scenario.id}
                onClick={() => onSelect(scenario)}
                className="w-full text-left rounded-md border px-3 py-2.5 transition-colors hover:border-opacity-80"
                style={{
                  background: isActive ? "var(--hamilton-accent-subtle)" : "var(--hamilton-surface-elevated)",
                  borderColor: isActive ? "var(--hamilton-accent)" : "var(--hamilton-border)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="text-sm font-medium leading-snug"
                    style={{ color: "var(--hamilton-text-primary)" }}
                  >
                    {formatCategory(scenario.fee_category)}
                  </span>
                  <span
                    className="text-xs rounded-full px-1.5 py-0.5 font-medium flex-shrink-0"
                    style={{ background: badge.bg, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 mt-1 text-xs tabular-nums"
                  style={{ color: "var(--hamilton-text-secondary)" }}
                >
                  <span>{formatDollar(scenario.current_value)}</span>
                  <span>→</span>
                  <span>{formatDollar(scenario.proposed_value)}</span>
                  <span className="ml-auto" style={{ color: "var(--hamilton-text-tertiary)" }}>
                    {timeAgo(scenario.created_at)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

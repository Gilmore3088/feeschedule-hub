"use client";

export interface SimulationCategory {
  fee_category: string;
  display_name: string;
  approved_count: number;
  confidence_tier: "strong" | "provisional" | "insufficient";
}

interface Props {
  categories: SimulationCategory[];
  selected: string | null;
  loading: boolean;
  onSelect: (feeCategory: string) => void;
}

const TIER_ORDER: SimulationCategory["confidence_tier"][] = [
  "strong",
  "provisional",
  "insufficient",
];

const TIER_LABELS: Record<SimulationCategory["confidence_tier"], string> = {
  strong: "Strong Data (20+ approved)",
  provisional: "Provisional (10–19 approved)",
  insufficient: "Insufficient (<10 approved)",
};

export function ScenarioCategorySelector({ categories, selected, loading, onSelect }: Props) {
  const grouped = TIER_ORDER.reduce<Record<string, SimulationCategory[]>>(
    (acc, tier) => {
      acc[tier] = categories.filter((c) => c.confidence_tier === tier);
      return acc;
    },
    { strong: [], provisional: [], insufficient: [] }
  );

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="fee-category-select"
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--hamilton-text-tertiary)" }}
      >
        Select fee category
      </label>
      <select
        id="fee-category-select"
        value={selected ?? ""}
        disabled={loading}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--hamilton-surface-elevated)",
          borderColor: "var(--hamilton-border)",
          color: "var(--hamilton-text-primary)",
          fontFamily: "var(--hamilton-font-sans)",
        }}
      >
        <option value="">
          {loading ? "Loading categories..." : "Select a fee category..."}
        </option>
        {TIER_ORDER.map((tier) => {
          const items = grouped[tier];
          if (items.length === 0) return null;
          return (
            <optgroup key={tier} label={TIER_LABELS[tier]}>
              {items.map((cat) => (
                <option key={cat.fee_category} value={cat.fee_category}>
                  {cat.display_name} ({cat.approved_count} approved)
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

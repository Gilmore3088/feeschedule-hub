"use client";

import { FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";

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

export function ScenarioCategorySelector({ categories, selected, loading, onSelect }: Props) {
  const grouped = Object.entries(FEE_FAMILIES)
    .map(([family, members]) => ({
      family,
      items: members
        .map((cat) => categories.find((c) => c.fee_category === cat))
        .filter((c): c is SimulationCategory => c !== undefined),
    }))
    .filter((g) => g.items.length > 0);

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
        {grouped.map(({ family, items }) => (
          <optgroup key={family} label={family}>
            {items.map((cat) => (
              <option key={cat.fee_category} value={cat.fee_category}>
                {DISPLAY_NAMES[cat.fee_category] ?? cat.display_name} ({cat.approved_count} approved)
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

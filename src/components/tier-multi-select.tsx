"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { TIER_LABELS } from "@/lib/fed-districts";

interface TierMultiSelectProps {
  tiers: { tier: string; count: number }[];
  selected: string[];
  basePath: string;
}

export function TierMultiSelect({ tiers, selected, basePath }: TierMultiSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggleTier = useCallback(
    (tier: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = new Set(selected);

      if (current.has(tier)) {
        current.delete(tier);
      } else {
        current.add(tier);
      }

      if (current.size > 0) {
        params.set("tier", Array.from(current).join(","));
      } else {
        params.delete("tier");
      }

      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, selected, basePath]
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiers.map((tc) => {
        const isSelected = selected.includes(tc.tier);
        return (
          <button
            key={tc.tier}
            onClick={() => toggleTier(tc.tier)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              isSelected
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200 font-medium"
                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
            }`}
          >
            <div className="text-gray-900 text-xs font-medium">
              {TIER_LABELS[tc.tier] || tc.tier}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {tc.count.toLocaleString()} institutions
            </div>
          </button>
        );
      })}
    </div>
  );
}

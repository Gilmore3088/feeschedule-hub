"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { TIER_LABELS, TIER_ORDER, DISTRICT_NAMES } from "@/lib/fed-districts";

export function PeerFiltersBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const charter = searchParams.get("charter") ?? "";
  const tier = searchParams.get("tier") ?? "";
  const district = searchParams.get("district") ?? "";
  const range = searchParams.get("range") ?? "";

  const selectedDistricts = district
    ? district.split(",").map((d) => parseInt(d, 10))
    : [];

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  const hasFilters = charter || tier || district || range;

  const resetAll = useCallback(() => {
    router.push("/admin");
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 print:hidden">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">
        Peer Filters
      </span>

      {/* Charter type */}
      <select
        value={charter}
        onChange={(e) => updateParams({ charter: e.target.value })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Charters</option>
        <option value="bank">Banks</option>
        <option value="credit_union">Credit Unions</option>
      </select>

      {/* Asset tier */}
      <select
        value={tier}
        onChange={(e) => updateParams({ tier: e.target.value })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Tiers</option>
        {TIER_ORDER.map((t) => (
          <option key={t} value={t}>
            {TIER_LABELS[t]}
          </option>
        ))}
      </select>

      {/* Fed district */}
      <select
        value={
          selectedDistricts.length === 1
            ? String(selectedDistricts[0])
            : selectedDistricts.length > 1
              ? "multi"
              : ""
        }
        onChange={(e) => {
          const val = e.target.value;
          if (val === "" || val === "multi") {
            updateParams({ district: "" });
          } else {
            updateParams({ district: val });
          }
        }}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Districts</option>
        {Object.entries(DISTRICT_NAMES).map(([num, name]) => (
          <option key={num} value={num}>
            {num} - {name}
          </option>
        ))}
        {selectedDistricts.length > 1 && (
          <option value="multi" disabled>
            {selectedDistricts.length} districts
          </option>
        )}
      </select>

      {/* Date range */}
      <select
        value={range}
        onChange={(e) => updateParams({ range: e.target.value })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Time</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={resetAll}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors
                     dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
        >
          Reset
        </button>
      )}

      {/* Active filter summary */}
      {selectedDistricts.length > 1 && (
        <span className="text-xs text-blue-600">
          Districts: {selectedDistricts.join(", ")}
        </span>
      )}
    </div>
  );
}

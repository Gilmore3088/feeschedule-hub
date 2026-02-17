"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { TIER_LABELS, TIER_ORDER, DISTRICT_NAMES } from "@/lib/fed-districts";

export function PeerIndexFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const charter = searchParams.get("charter") ?? "";
  const tier = searchParams.get("tier") ?? "";
  const district = searchParams.get("district") ?? "";

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
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, searchParams, pathname]
  );

  const hasPeerFilters = charter || tier || district;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">
        Peer Filters
      </span>

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

      <select
        value={district}
        onChange={(e) => updateParams({ district: e.target.value })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Districts</option>
        {Object.entries(DISTRICT_NAMES).map(([num, name]) => (
          <option key={num} value={num}>
            {num} - {name}
          </option>
        ))}
      </select>

      {hasPeerFilters && (
        <button
          onClick={() => updateParams({ charter: "", tier: "", district: "" })}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors
                     dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
        >
          Reset peers
        </button>
      )}
    </div>
  );
}

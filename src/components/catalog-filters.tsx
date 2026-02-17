"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { FEATURED_COUNT, TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

interface CatalogFiltersProps {
  families: string[];
}

export function CatalogFilters({ families }: CatalogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const family = searchParams.get("family") ?? "";
  const sort = searchParams.get("sort") ?? "institution_count";
  const columns = searchParams.get("columns") ?? "compact";
  const show = searchParams.get("show") ?? "";

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
      router.push(`/admin/fees/catalog?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
      <button
        onClick={() => updateParams({ show: show === "all" ? "" : "all" })}
        aria-pressed={show === "all"}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          show === "all"
            ? "bg-gray-900 border-gray-900 text-white dark:bg-white/[0.15] dark:border-white/[0.15]"
            : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
        }`}
      >
        {show === "all" ? `All (${TAXONOMY_COUNT})` : `Featured (${FEATURED_COUNT})`}
      </button>
      <input
        type="text"
        placeholder="Search fee types..."
        defaultValue={search}
        onChange={(e) => updateParams({ search: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
      />
      <select
        value={family}
        onChange={(e) => updateParams({ family: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="">All Families</option>
        {families.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
      >
        <option value="institution_count">Most Institutions</option>
        <option value="median_amount">Highest Median</option>
        <option value="spread">Widest Spread</option>
        <option value="fee_category">Alphabetical</option>
      </select>
      <button
        onClick={() =>
          updateParams({ columns: columns === "compact" ? "full" : "compact" })
        }
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          columns === "full"
            ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800/40 dark:text-blue-400"
            : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
        }`}
      >
        {columns === "full" ? "Compact view" : "Show all columns"}
      </button>
    </div>
  );
}

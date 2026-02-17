"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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
      <input
        type="text"
        placeholder="Search fee types..."
        defaultValue={search}
        onChange={(e) => updateParams({ search: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <select
        value={family}
        onChange={(e) => updateParams({ family: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            ? "bg-blue-50 border-blue-300 text-blue-700"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {columns === "full" ? "Compact view" : "Show all columns"}
      </button>
    </div>
  );
}

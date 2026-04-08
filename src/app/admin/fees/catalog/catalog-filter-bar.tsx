"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { FEATURED_COUNT, TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

interface CatalogFilterBarProps {
  families: string[];
}

export function CatalogFilterBar({ families }: CatalogFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const search = searchParams.get("search") ?? "";
  const family = searchParams.get("family") ?? "";
  const showAll = searchParams.get("show") === "all";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.push(url);
      router.refresh();
    },
    [searchParams, router, pathname]
  );

  const hasAnyFilter = search || family || showAll;

  return (
    <div className="sticky top-[57px] z-40 -mx-6 px-6 py-3 bg-white/95 backdrop-blur-sm border-b dark:bg-[oklch(0.15_0_0)]/95 dark:border-white/[0.08] mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => updateParams({ show: showAll ? null : "all" })}
          aria-pressed={showAll}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            showAll
              ? "bg-gray-900 border-gray-900 text-white dark:bg-white/15 dark:border-white/15"
              : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-400"
          }`}
        >
          {showAll ? `All (${TAXONOMY_COUNT})` : `Featured (${FEATURED_COUNT})`}
        </button>

        <input
          type="search"
          placeholder="Search fee types..."
          defaultValue={search}
          onChange={(e) => updateParams({ search: e.target.value || null })}
          className="w-48 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                   dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
        />

        <select
          value={family}
          onChange={(e) => updateParams({ family: e.target.value || null })}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                   dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
        >
          <option value="">All families</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        {hasAnyFilter && (
          <button
            onClick={() =>
              updateParams({
                search: null,
                family: null,
                show: null,
                sort: null,
                dir: null,
              })
            }
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline dark:text-gray-400"
          >
            Reset all
          </button>
        )}
      </div>
    </div>
  );
}

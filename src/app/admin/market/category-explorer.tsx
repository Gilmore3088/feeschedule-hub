"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatAmount } from "@/lib/format";
import {
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  FEE_FAMILIES,
  isFeaturedFee,
  FEATURED_COUNT,
  TAXONOMY_COUNT,
} from "@/lib/fee-taxonomy";
import { MaturityBadge } from "@/app/admin/index/maturity-badge";
import { DeltaPill } from "./hero-cards";
import type { MarketIndexEntry } from "@/lib/crawler-db";

interface CategoryExplorerProps {
  entries: MarketIndexEntry[];
  selectedCategory: string | null;
  hasFilters: boolean;
}

export function CategoryExplorer({
  entries,
  selectedCategory,
  hasFilters,
}: CategoryExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(
    () => new Set(Object.keys(FEE_FAMILIES))
  );
  const [search, setSearch] = useState("");

  // Use URL param for showAll so state persists on refresh/share
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
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, router, pathname]
  );

  const selectCategory = useCallback(
    (cat: string) => {
      if (selectedCategory === cat) {
        updateParams({ cat: null });
      } else {
        updateParams({ cat });
      }
    },
    [selectedCategory, updateParams]
  );

  const toggleFamily = useCallback((family: string) => {
    setOpenFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  }, []);

  const filteredEntries = useMemo(() => {
    let result = entries;
    // Search always searches all categories
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          getDisplayName(e.fee_category).toLowerCase().includes(q) ||
          e.fee_category.toLowerCase().includes(q)
      );
    } else if (!showAll) {
      // Apply tier filter only when not searching
      result = result.filter((e) => isFeaturedFee(e.fee_category));
    }
    return result;
  }, [entries, search, showAll]);

  const groupedByFamily = useMemo(() => {
    const groups = new Map<string, MarketIndexEntry[]>();
    for (const family of Object.keys(FEE_FAMILIES)) {
      groups.set(family, []);
    }
    groups.set("Other", []);

    for (const entry of filteredEntries) {
      const family = getFeeFamily(entry.fee_category) ?? "Other";
      const group = groups.get(family);
      if (group) {
        group.push(entry);
      }
    }

    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  }, [filteredEntries]);

  return (
    <div className="admin-card">
      <div className="px-5 py-3 border-b bg-gray-50/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-800">
            Fee Categories
          </h2>
          <span className="text-[11px] text-gray-400">
            {hasFilters ? "Segment View" : "National View"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateParams({ show: showAll ? null : "all" })}
            aria-pressed={showAll}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              showAll
                ? "bg-gray-900 border-gray-900 text-white dark:bg-white/15 dark:border-white/15"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-400"
            }`}
          >
            {showAll ? `All (${TAXONOMY_COUNT})` : `Featured (${FEATURED_COUNT})`}
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="divide-y">
        {groupedByFamily.map(([family, items]) => {
          const isOpen = openFamilies.has(family);
          const colors = getFamilyColor(family);
          const familyMedianRange = items
            .filter((i) => i.median_amount !== null)
            .map((i) => i.median_amount!);
          const minMedian =
            familyMedianRange.length > 0
              ? Math.min(...familyMedianRange)
              : null;
          const maxMedian =
            familyMedianRange.length > 0
              ? Math.max(...familyMedianRange)
              : null;

          return (
            <div key={family}>
              <button
                onClick={() => toggleFamily(family)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50/50 transition-colors`}
              >
                {isOpen ? (
                  <ChevronDown
                    className={`h-3.5 w-3.5 flex-shrink-0 ${colors.text}`}
                  />
                ) : (
                  <ChevronRight
                    className={`h-3.5 w-3.5 flex-shrink-0 ${colors.text}`}
                  />
                )}
                <span className={`text-sm font-semibold ${colors.text}`}>
                  {family}
                </span>
                <span className="text-[11px] text-gray-400 ml-1">
                  {items.length} categories
                </span>
                {minMedian !== null && maxMedian !== null && (
                  <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
                    {formatAmount(minMedian)} &ndash;{" "}
                    {formatAmount(maxMedian)}
                  </span>
                )}
              </button>
              {isOpen && items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t bg-gray-50/80">
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider min-w-[180px]">
                          Fee Category
                        </th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          Median
                        </th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          P25
                        </th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          P75
                        </th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          Spread
                        </th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          Inst
                        </th>
                        {hasFilters && (
                          <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            vs Nat.
                          </th>
                        )}
                        <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          Maturity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((entry) => {
                        const isSelected =
                          selectedCategory === entry.fee_category;
                        const hasData = entry.institution_count > 0;
                        const spread =
                          entry.p75_amount !== null &&
                          entry.p25_amount !== null
                            ? entry.p75_amount - entry.p25_amount
                            : null;

                        return (
                          <tr
                            key={entry.fee_category}
                            onClick={() => selectCategory(entry.fee_category)}
                            className={`border-t cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-blue-50/50"
                                : "hover:bg-blue-50/30"
                            } ${!hasData ? "opacity-50" : ""}`}
                          >
                            <td className="px-4 py-2.5">
                              <span
                                className={`text-gray-900 ${
                                  isSelected ? "font-semibold" : ""
                                }`}
                              >
                                {getDisplayName(entry.fee_category)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900">
                              {hasData
                                ? formatAmount(entry.median_amount)
                                : "–"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                              {hasData
                                ? formatAmount(entry.p25_amount)
                                : "–"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                              {hasData
                                ? formatAmount(entry.p75_amount)
                                : "–"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                              {spread !== null
                                ? formatAmount(spread)
                                : "–"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                              {entry.institution_count > 0
                                ? entry.institution_count.toLocaleString()
                                : "–"}
                            </td>
                            {hasFilters && (
                              <td className="px-4 py-2.5 text-right">
                                {entry.delta_pct !== null ? (
                                  <DeltaPill delta={entry.delta_pct} />
                                ) : (
                                  <span className="text-gray-400">–</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-center">
                              <MaturityBadge
                                tier={entry.maturity_tier}
                                approved={entry.approved_count}
                                total={entry.observation_count}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

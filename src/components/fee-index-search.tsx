"use client";

import { useState } from "react";
import Link from "next/link";
import { FAMILY_COLORS, getDisplayName, getFeeTier, isFeaturedFee } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

interface FeeIndexSearchProps {
  families: Record<string, string[]>;
  entryMap: Record<string, IndexEntry>;
}

export function FeeIndexSearch({ families, entryMap }: FeeIndexSearchProps) {
  const [search, setSearch] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  const searchLower = search.toLowerCase();

  const familyNames = Object.keys(families);

  return (
    <div>
      {/* Search + Filter bar */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search fees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <select
          value={selectedFamily ?? ""}
          onChange={(e) => setSelectedFamily(e.target.value || null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
        >
          <option value="">All Families</option>
          {familyNames.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <button
          onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
          className={`rounded-lg border px-3.5 py-2.5 text-[12px] font-medium transition-colors ${
            showFeaturedOnly
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          {showFeaturedOnly ? "Featured Only" : "Show All"}
        </button>
      </div>

      {/* Families */}
      {Object.entries(families)
        .filter(([family]) => !selectedFamily || family === selectedFamily)
        .map(([family, categories]) => {
          const colors = FAMILY_COLORS[family] ?? {
            border: "border-l-gray-400",
            bg: "bg-gray-50",
            text: "text-gray-700",
          };

          const filtered = categories.filter((cat) => {
            if (showFeaturedOnly && !isFeaturedFee(cat)) return false;
            if (searchLower) {
              const name = getDisplayName(cat).toLowerCase();
              const catKey = cat.toLowerCase();
              return name.includes(searchLower) || catKey.includes(searchLower);
            }
            return true;
          });

          if (filtered.length === 0) return null;

          return (
            <section key={family} className="mb-10">
              <h2
                className={`mb-4 flex items-center gap-2 text-sm font-bold ${colors.text}`}
              >
                <span
                  className={`inline-block h-3 w-1 rounded-full ${colors.border.replace("border-l-", "bg-")}`}
                />
                {family}
                <span className="text-xs font-normal text-slate-400">
                  ({filtered.length})
                </span>
              </h2>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Fee Category
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Median
                      </th>
                      <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                        P25-P75
                      </th>
                      <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                        Institutions
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Tier
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((cat) => {
                      const entry = entryMap[cat];
                      const tier = getFeeTier(cat);
                      const featured = isFeaturedFee(cat);
                      return (
                        <tr
                          key={cat}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/fees/${cat}`}
                              className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                            >
                              {getDisplayName(cat)}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-700">
                            {entry
                              ? formatAmount(entry.median_amount)
                              : "-"}
                          </td>
                          <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
                            {entry?.p25_amount != null &&
                            entry?.p75_amount != null
                              ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
                              : "-"}
                          </td>
                          <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 md:table-cell">
                            {entry?.institution_count?.toLocaleString() ??
                              "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {featured ? (
                              <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                                {tier === "spotlight"
                                  ? "Spotlight"
                                  : "Core"}
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wider text-slate-300">
                                {tier}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      {/* No results */}
      {search &&
        Object.entries(families).every(([family, categories]) => {
          if (selectedFamily && family !== selectedFamily) return true;
          return categories.every((cat) => {
            if (showFeaturedOnly && !isFeaturedFee(cat)) return true;
            const name = getDisplayName(cat).toLowerCase();
            return !name.includes(searchLower) && !cat.toLowerCase().includes(searchLower);
          });
        }) && (
          <div className="rounded-lg border border-dashed border-slate-200 px-8 py-12 text-center">
            <p className="text-sm text-slate-500">
              No fees match &ldquo;{search}&rdquo;
            </p>
            <button
              onClick={() => {
                setSearch("");
                setSelectedFamily(null);
                setShowFeaturedOnly(false);
              }}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import type { FeeInstance } from "@/lib/crawler-db";
import { formatAmount, formatAssets } from "@/lib/format";

type SortKey =
  | "institution_name"
  | "amount"
  | "charter_type"
  | "state_code"
  | "asset_size_tier"
  | "asset_size";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export function InstitutionTable({
  fees,
  median,
}: {
  fees: FeeInstance[];
  median: number | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [charterFilter, setCharterFilter] = useState<"all" | "bank" | "credit_union">("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let result = fees;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((f) =>
        f.institution_name.toLowerCase().includes(q)
      );
    }

    if (charterFilter !== "all") {
      result = result.filter((f) => f.charter_type === charterFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "institution_name":
          cmp = a.institution_name.localeCompare(b.institution_name);
          break;
        case "amount":
          cmp = (a.amount ?? -1) - (b.amount ?? -1);
          break;
        case "charter_type":
          cmp = a.charter_type.localeCompare(b.charter_type);
          break;
        case "state_code":
          cmp = (a.state_code ?? "").localeCompare(b.state_code ?? "");
          break;
        case "asset_size_tier":
          cmp = (a.asset_size_tier ?? "").localeCompare(
            b.asset_size_tier ?? ""
          );
          break;
        case "asset_size":
          cmp = (a.asset_size ?? 0) - (b.asset_size ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [fees, search, charterFilter, sortKey, sortDir]);

  const displayed = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "institution_name" ? "asc" : "desc");
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600" />
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700 mr-auto">
          All Institutions ({filtered.length})
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search institutions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "bank", "credit_union"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setCharterFilter(filter)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                charterFilter === filter
                  ? filter === "bank"
                    ? "bg-blue-100 text-blue-700"
                    : filter === "credit_union"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-200 text-gray-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {filter === "all" ? "All" : filter === "bank" ? "Banks" : "CUs"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-2 font-medium sticky left-0 bg-white z-10 min-w-[200px]">
                <button
                  onClick={() => handleSort("institution_name")}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Institution <SortIcon column="institution_name" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium text-right">
                <button
                  onClick={() => handleSort("amount")}
                  className="flex items-center gap-1 ml-auto hover:text-gray-900"
                >
                  Amount <SortIcon column="amount" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Frequency</th>
              <th className="px-4 py-2 font-medium">
                <button
                  onClick={() => handleSort("charter_type")}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Type <SortIcon column="charter_type" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  onClick={() => handleSort("state_code")}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  State <SortIcon column="state_code" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium text-right">
                <button
                  onClick={() => handleSort("asset_size")}
                  className="flex items-center gap-1 ml-auto hover:text-gray-900"
                >
                  Assets <SortIcon column="asset_size" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((fee) => {
              const isHigh =
                median !== null &&
                fee.amount !== null &&
                fee.amount > median * 1.5;
              const isLow =
                median !== null &&
                fee.amount !== null &&
                median > 0 &&
                fee.amount < median * 0.5;
              return (
                <tr
                  key={fee.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2 sticky left-0 bg-white z-10">
                    <Link
                      href={`/admin/peers/${fee.crawl_target_id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {fee.institution_name}
                    </Link>
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono font-semibold ${
                      isHigh
                        ? "text-red-600"
                        : isLow
                          ? "text-green-600"
                          : "text-gray-900"
                    }`}
                  >
                    {formatAmount(fee.amount)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {fee.frequency ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        fee.charter_type === "bank"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {fee.charter_type === "bank" ? "Bank" : "CU"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {fee.state_code ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {formatAssets(fee.asset_size)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        fee.review_status === "approved"
                          ? "bg-green-100 text-green-700"
                          : fee.review_status === "staged"
                            ? "bg-blue-100 text-blue-700"
                            : fee.review_status === "flagged"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {fee.review_status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE_SIZE && !showAll && (
        <div className="px-4 py-3 border-t text-center">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Show all {filtered.length} institutions
          </button>
        </div>
      )}
      {showAll && filtered.length > PAGE_SIZE && (
        <div className="px-4 py-3 border-t text-center">
          <button
            onClick={() => setShowAll(false)}
            className="text-sm text-gray-500 hover:underline"
          >
            Show fewer
          </button>
        </div>
      )}
    </div>
  );
}

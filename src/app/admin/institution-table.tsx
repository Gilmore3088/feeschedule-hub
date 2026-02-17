"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import type { InstitutionSummary } from "@/lib/crawler-db";
import { formatAssets } from "@/lib/format";

type SortKey = "institution_name" | "state_code" | "asset_size" | "fee_count";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export function InstitutionTable({
  institutions,
}: {
  institutions: InstitutionSummary[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("asset_size");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [charterFilter, setCharterFilter] = useState<"all" | "bank" | "credit_union">("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let result = institutions;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((inst) =>
        inst.institution_name.toLowerCase().includes(q)
      );
    }

    if (charterFilter !== "all") {
      result = result.filter((inst) => inst.charter_type === charterFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "institution_name":
          cmp = a.institution_name.localeCompare(b.institution_name);
          break;
        case "state_code":
          cmp = (a.state_code ?? "").localeCompare(b.state_code ?? "");
          break;
        case "asset_size":
          cmp = (a.asset_size ?? 0) - (b.asset_size ?? 0);
          break;
        case "fee_count":
          cmp = a.fee_count - b.fee_count;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [institutions, search, charterFilter, sortKey, sortDir]);

  const displayed = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "institution_name" || key === "state_code" ? "asc" : "desc");
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
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 dark:bg-white/[0.03] flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-gray-700">
            Institutions with Extracted Fees ({filtered.length})
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Click an institution to view its peer profile
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search institutions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowAll(false);
            }}
            className="rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "bank", "credit_union"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setCharterFilter(filter);
                setShowAll(false);
              }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                charterFilter === filter
                  ? filter === "bank"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : filter === "credit_union"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-gray-200 text-gray-700 dark:bg-white/[0.12] dark:text-gray-300"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1]"
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
              <th className="px-4 py-2 font-medium">
                <button
                  onClick={() => handleSort("institution_name")}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  Institution <SortIcon column="institution_name" />
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
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium text-right">
                <button
                  onClick={() => handleSort("asset_size")}
                  className="flex items-center gap-1 ml-auto hover:text-gray-900"
                >
                  Assets <SortIcon column="asset_size" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium text-center">Doc</th>
              <th className="px-4 py-2 font-medium text-right">
                <button
                  onClick={() => handleSort("fee_count")}
                  className="flex items-center gap-1 ml-auto hover:text-gray-900"
                >
                  Fees <SortIcon column="fee_count" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {search
                    ? `No institutions matching "${search}"`
                    : "No institutions found"}
                </td>
              </tr>
            ) : (
              displayed.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/peers/${inst.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {inst.institution_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {inst.state_code || "-"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        inst.charter_type === "bank"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}
                    >
                      {inst.charter_type === "bank" ? "Bank" : "CU"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {formatAssets(inst.asset_size)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono ${
                        inst.document_type === "pdf"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      }`}
                    >
                      {inst.document_type?.toUpperCase() || "?"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {inst.fee_count > 0 ? (
                      <Link
                        href={`/admin/fees?id=${inst.id}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {inst.fee_count}
                      </Link>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              ))
            )}
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

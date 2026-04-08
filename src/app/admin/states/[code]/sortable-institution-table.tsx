"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import type { StateInstitution } from "@/lib/crawler-db/states";
import { formatAssets } from "@/lib/format";
import { InstitutionRow } from "./institution-row";

type SortKey = "institution_name" | "asset_size" | "fee_count" | "status" | "charter_type" | "city";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

function statusRank(inst: StateInstitution): number {
  if (inst.fee_count > 0) return 3;
  if (inst.document_type === "offline") return 0;
  if (inst.fee_schedule_url) return 2;
  return 1;
}

export function SortableInstitutionTable({
  institutions,
  stateCode,
}: {
  institutions: StateInstitution[];
  stateCode: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const sortKey = (searchParams.get("sort") as SortKey) || "asset_size";
  const sortDir = (searchParams.get("dir") as SortDir) || "desc";
  const search = searchParams.get("q") ?? "";
  const charterFilter = searchParams.get("charter") ?? "all";

  const [showAll, setShowAll] = useState(false);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      updateParams({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      const defaultDir = key === "institution_name" || key === "city" ? "asc" : "desc";
      updateParams({ sort: key, dir: defaultDir });
    }
  }

  const filtered = useMemo(() => {
    let result = [...institutions];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (inst) =>
          inst.institution_name.toLowerCase().includes(q) ||
          (inst.city && inst.city.toLowerCase().includes(q))
      );
    }

    if (charterFilter !== "all") {
      result = result.filter((inst) => inst.charter_type === charterFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "institution_name":
          cmp = a.institution_name.localeCompare(b.institution_name);
          break;
        case "city":
          cmp = (a.city ?? "").localeCompare(b.city ?? "");
          break;
        case "asset_size":
          cmp = (a.asset_size ?? 0) - (b.asset_size ?? 0);
          break;
        case "fee_count":
          cmp = a.fee_count - b.fee_count;
          break;
        case "status":
          cmp = statusRank(a) - statusRank(b);
          break;
        case "charter_type":
          cmp = (a.charter_type ?? "").localeCompare(b.charter_type ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [institutions, search, charterFilter, sortKey, sortDir]);

  const displayed = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />
    );
  }

  return (
    <div className="admin-card overflow-hidden mb-8">
      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex flex-wrap items-center gap-3">
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em] mr-auto">
          Institutions ({filtered.length})
        </h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by name or city..."
            defaultValue={search}
            onChange={(e) => updateParams({ q: e.target.value || null })}
            className="rounded-md border border-gray-300 pl-7 pr-3 py-1 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500
                       dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Charter filter */}
        <div className="flex gap-1">
          {(["all", "bank", "credit_union"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => updateParams({ charter: filter === "all" ? null : filter })}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                (charterFilter === "all" && filter === "all") ||
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

      {/* Table */}
      {filtered.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>
                    <button
                      onClick={() => handleSort("institution_name")}
                      className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Name <SortIcon column="institution_name" />
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort("city")}
                      className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      City <SortIcon column="city" />
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort("charter_type")}
                      className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Charter <SortIcon column="charter_type" />
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort("status")}
                      className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Status <SortIcon column="status" />
                    </button>
                  </th>
                  <th>Fee URL / Actions</th>
                  <th className="text-right">
                    <button
                      onClick={() => handleSort("asset_size")}
                      className="flex items-center gap-1 ml-auto hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Assets <SortIcon column="asset_size" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((inst) => (
                  <InstitutionRow
                    key={inst.id}
                    id={inst.id}
                    institution_name={inst.institution_name}
                    city={inst.city}
                    charter_type={inst.charter_type}
                    asset_size_tier={inst.asset_size_tier}
                    fee_schedule_url={inst.fee_schedule_url}
                    document_type={inst.document_type}
                    fee_count={inst.fee_count}
                    last_crawled={inst.last_crawled}
                    stateCode={stateCode}
                    assetSize={inst.asset_size}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Show more / fewer */}
          {filtered.length > PAGE_SIZE && !showAll && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-white/[0.04] text-center">
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-blue-600 hover:underline font-medium dark:text-blue-400"
              >
                Show all {filtered.length} institutions
              </button>
            </div>
          )}
          {showAll && filtered.length > PAGE_SIZE && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-white/[0.04] text-center">
              <button
                onClick={() => setShowAll(false)}
                className="text-xs text-gray-500 hover:underline dark:text-gray-400"
              >
                Show fewer
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="p-6 text-xs text-gray-400 text-center">
          {search ? `No institutions matching "${search}"` : "No institutions found"}
        </div>
      )}
    </div>
  );
}

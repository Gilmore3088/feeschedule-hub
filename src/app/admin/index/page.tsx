import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getNationalIndex, getPeerIndex, type IndexEntry } from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parsePeerFilters, buildFilterDescription } from "@/lib/fed-districts";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  isFeaturedFee,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { IndexFilterBar, SortHeader } from "./index-filter-bar";
import { MaturityBadge } from "./maturity-badge";

export default async function FeeIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    family?: string;
    approved?: string;
    sort?: string;
    dir?: string;
    show?: string;
    charter?: string;
    tier?: string;
    district?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const searchTerm = params.q ?? "";
  const activeFamily = params.family ?? "";
  const approvedOnly = params.approved === "1";
  const sortKey = params.sort ?? "";
  const sortDir = params.dir ?? "asc";
  const showAll = params.show === "all";

  const peerFilters = parsePeerFilters(params);
  const hasPeerFilters = !!(
    peerFilters.charter ||
    peerFilters.tiers ||
    peerFilters.districts
  );

  let entries: IndexEntry[];
  if (hasPeerFilters) {
    entries = await getPeerIndex(
      {
        charter_type: peerFilters.charter,
        asset_tiers: peerFilters.tiers,
        fed_districts: peerFilters.districts,
      },
      approvedOnly
    );
  } else {
    entries = await getNationalIndex(approvedOnly);
  }

  const filterDescription = hasPeerFilters
    ? buildFilterDescription(peerFilters)
    : null;

  // Search always queries all categories
  if (searchTerm) {
    entries = entries.filter((e) =>
      getDisplayName(e.fee_category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }

  // Apply featured filter unless searching or show=all
  if (!showAll && !searchTerm) {
    entries = entries.filter((e) => isFeaturedFee(e.fee_category));
  }

  // Family filter
  if (activeFamily) {
    entries = entries.filter(
      (e) => getFeeFamily(e.fee_category) === activeFamily
    );
  }

  // Sort
  const SORT_FNS: Record<string, (a: IndexEntry, b: IndexEntry) => number> = {
    category: (a, b) =>
      getDisplayName(a.fee_category).localeCompare(
        getDisplayName(b.fee_category)
      ),
    median: (a, b) => (a.median_amount ?? 0) - (b.median_amount ?? 0),
    p25: (a, b) => (a.p25_amount ?? 0) - (b.p25_amount ?? 0),
    p75: (a, b) => (a.p75_amount ?? 0) - (b.p75_amount ?? 0),
    institutions: (a, b) => a.institution_count - b.institution_count,
    maturity: (a, b) => {
      const order = { strong: 0, provisional: 1, insufficient: 2 };
      return order[a.maturity_tier] - order[b.maturity_tier];
    },
  };

  if (sortKey && SORT_FNS[sortKey]) {
    entries.sort(SORT_FNS[sortKey]);
    if (sortDir === "desc") entries.reverse();
  }

  // Compute available families for filter dropdown
  const allFamilies = Object.keys(FEE_FAMILIES).filter((f) =>
    entries.some((e) => getFeeFamily(e.fee_category) === f)
  );

  // Insight card stats
  const totalCategories = entries.length;
  const strongCount = entries.filter(
    (e) => e.maturity_tier === "strong"
  ).length;
  const totalObservations = entries.reduce(
    (s, i) => s + i.observation_count,
    0
  );
  const allMedians = entries
    .map((e) => e.median_amount)
    .filter((m): m is number => m !== null);
  const overallMedian =
    allMedians.length > 0
      ? allMedians.sort((a, b) => a - b)[Math.floor(allMedians.length / 2)]
      : null;

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Fee Index" },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {hasPeerFilters ? "Peer Fee Index" : "National Fee Index"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {hasPeerFilters
                ? filterDescription
                : "Benchmark medians across U.S. financial institutions"}
              {approvedOnly && (
                <span className="ml-2 text-amber-600 font-medium">
                  (Approved only)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Categories
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {totalCategories}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            of{" "}
            {showAll || searchTerm ? TAXONOMY_COUNT : FEATURED_COUNT}{" "}
            {showAll || searchTerm ? "total" : "featured"}
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Typical Median
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {overallMedian !== null ? formatAmount(overallMedian) : "-"}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            across all categories
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Observations
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {totalObservations.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            data points
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Data Maturity
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {totalCategories > 0
              ? `${((strongCount / totalCategories) * 100).toFixed(0)}%`
              : "0%"}{" "}
            strong
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {strongCount} of {totalCategories} with 10+ approved
          </p>
        </div>
      </div>

      {/* Unified filter bar */}
      <Suspense fallback={null}>
        <IndexFilterBar
          families={allFamilies}
          selectedTiers={peerFilters.tiers ?? []}
          selectedCharter={peerFilters.charter ?? ""}
          selectedDistricts={peerFilters.districts ?? []}
        />
      </Suspense>

      {/* Flat table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 dark:bg-[oklch(0.17_0_0)] z-10 min-w-[180px]">
                  <Suspense fallback="Category">
                    <SortHeader
                      label="Category"
                      sortKey="category"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Family
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                  <Suspense fallback="Median">
                    <SortHeader
                      label="Median"
                      sortKey="median"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                  <Suspense fallback="P25">
                    <SortHeader
                      label="P25"
                      sortKey="p25"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                  <Suspense fallback="P75">
                    <SortHeader
                      label="P75"
                      sortKey="p75"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                  <Suspense fallback="Inst.">
                    <SortHeader
                      label="Inst."
                      sortKey="institutions"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                  <Suspense fallback="Maturity">
                    <SortHeader
                      label="Maturity"
                      sortKey="maturity"
                      currentSort={sortKey}
                      currentDir={sortDir}
                    />
                  </Suspense>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item) => {
                const family = getFeeFamily(item.fee_category);
                const tier = getFeeTier(item.fee_category);
                const isFeatured = tier === "spotlight" || tier === "core";

                return (
                  <tr
                    key={item.fee_category}
                    className="border-b last:border-0 hover:bg-blue-50/30 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-[oklch(0.15_0_0)] z-10">
                      <Link
                        href={`/admin/fees/catalog/${item.fee_category}`}
                        className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                      >
                        {getDisplayName(item.fee_category)}
                      </Link>
                      {!isFeatured && (
                        <span className="ml-2 text-[9px] font-semibold text-gray-300 uppercase tracking-wider dark:text-gray-600">
                          {tier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {family ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {formatAmount(item.median_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {formatAmount(item.p25_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {formatAmount(item.p75_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100 font-medium">
                      {item.institution_count}
                      <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">
                        ({item.bank_count}b/{item.cu_count}c)
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <MaturityBadge
                        tier={item.maturity_tier}
                        approved={item.approved_count}
                        total={item.observation_count}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {approvedOnly
              ? "No approved fees yet. Toggle off 'Approved only' to see provisional index."
              : `No fee categories found${searchTerm ? ` matching "${searchTerm}"` : ""}.`}
          </div>
        )}
      </div>
    </>
  );
}

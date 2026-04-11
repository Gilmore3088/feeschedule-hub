export const dynamic = "force-dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getFeeCategorySummaries,
  type FeeCategorySummary,
} from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ServerSortableTable, type ServerColumn } from "@/components/server-sortable-table";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  isFeaturedFee,
  getFeeTier,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { CatalogFilterBar } from "./catalog-filter-bar";
import { CatalogActions } from "@/components/catalog-actions";

const VALID_PER = [25, 50, 100] as const;

export default async function FeeCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    family?: string;
    sort?: string;
    dir?: string;
    show?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const searchTerm = params.search ?? "";
  const activeFamily = params.family ?? "";
  const sortKey = params.sort ?? "institution_count";
  const sortDir = params.dir ?? "desc";
  const showFeatured = params.show === "featured";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const perPage = VALID_PER.includes(Number(params.per) as 25 | 50 | 100) ? Number(params.per) : 50;

  let summaries = await getFeeCategorySummaries();

  // Search always searches all categories
  if (searchTerm) {
    summaries = summaries.filter((s) =>
      getDisplayName(s.fee_category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }

  // Apply tier filter: default to ALL, unless show=featured is explicitly set
  if (showFeatured && !searchTerm) {
    summaries = summaries.filter((s) => isFeaturedFee(s.fee_category));
  }

  // Family filter
  if (activeFamily) {
    summaries = summaries.filter(
      (s) => getFeeFamily(s.fee_category) === activeFamily
    );
  }

  // Sort
  const SORT_FNS: Record<
    string,
    (a: FeeCategorySummary, b: FeeCategorySummary) => number
  > = {
    institution_count: (a, b) => a.institution_count - b.institution_count,
    median_amount: (a, b) =>
      (a.median_amount ?? 0) - (b.median_amount ?? 0),
    spread: (a, b) => {
      const sa =
        a.max_amount !== null && a.min_amount !== null
          ? a.max_amount - a.min_amount
          : 0;
      const sb =
        b.max_amount !== null && b.min_amount !== null
          ? b.max_amount - b.min_amount
          : 0;
      return sa - sb;
    },
    fee_category: (a, b) =>
      getDisplayName(a.fee_category).localeCompare(
        getDisplayName(b.fee_category)
      ),
  };

  if (SORT_FNS[sortKey]) {
    summaries.sort(SORT_FNS[sortKey]);
    if (sortDir === "desc") summaries.reverse();
  }

  // Available families for filter
  const allFamilies = Object.keys(FEE_FAMILIES).filter((f) =>
    summaries.some((s) => getFeeFamily(s.fee_category) === f)
  );

  // Stats
  const totalCategories = summaries.length;
  const totalObservations = summaries.reduce(
    (s, r) => s + r.total_observations,
    0
  );
  const totalInstitutions = new Set(
    summaries.flatMap((s) => Array(s.institution_count).fill(s.fee_category))
  ).size;

  const highestMedian = [...summaries].sort(
    (a, b) => (b.median_amount ?? 0) - (a.median_amount ?? 0)
  )[0];
  const widestSpread = [...summaries].sort((a, b) => {
    const sa =
      a.max_amount !== null && a.min_amount !== null
        ? a.max_amount - a.min_amount
        : 0;
    const sb =
      b.max_amount !== null && b.min_amount !== null
        ? b.max_amount - b.min_amount
        : 0;
    return sb - sa;
  })[0];
  const mostCommon = [...summaries].sort(
    (a, b) => b.institution_count - a.institution_count
  )[0];

  // Global max for range bar scaling
  const globalMax = Math.max(
    ...summaries
      .map((s) => s.p75_amount ?? s.max_amount ?? 0)
      .filter((v) => v > 0),
    1
  );

  // Paginate after sorting/filtering
  const paginatedSummaries = summaries.slice((currentPage - 1) * perPage, currentPage * perPage);

  const catalogColumns: ServerColumn<FeeCategorySummary>[] = [
    {
      key: "fee_category",
      label: "Fee Type",
      sortable: true,
      className: "sticky left-0 bg-gray-50/80 dark:bg-[oklch(0.17_0_0)] z-10 min-w-[220px]",
      render: (item) => {
        const family = getFeeFamily(item.fee_category);
        const colors = family ? getFamilyColor(family) : null;
        const tier = getFeeTier(item.fee_category);
        const isFeatured = tier === "spotlight" || tier === "core";
        return (
          <div className="flex items-center gap-2">
            {colors && (
              <span
                className={`w-1 h-5 rounded-full flex-shrink-0 ${colors.border.replace("border-l-", "bg-")}`}
              />
            )}
            <div>
              <Link
                href={`/admin/fees/catalog/${item.fee_category}`}
                className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
              >
                {getDisplayName(item.fee_category)}
              </Link>
              {!isFeatured && (
                <span className="ml-1.5 text-[9px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider">
                  {tier}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "family",
      label: "Family",
      sortable: false,
      render: (item) => {
        const family = getFeeFamily(item.fee_category);
        const colors = family ? getFamilyColor(family) : null;
        return family && colors ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
            {family}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">Other</span>
        );
      },
    },
    {
      key: "institution_count",
      label: "Inst.",
      sortable: true,
      align: "right",
      render: (item) => (
        <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {item.institution_count}
        </span>
      ),
    },
    {
      key: "median_amount",
      label: "Median",
      sortable: true,
      align: "right",
      render: (item) => (
        <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
          {formatAmount(item.median_amount)}
        </span>
      ),
    },
    {
      key: "p25",
      label: "P25",
      sortable: false,
      align: "right",
      render: (item) => (
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {formatAmount(item.p25_amount)}
        </span>
      ),
    },
    {
      key: "p75",
      label: "P75",
      sortable: false,
      align: "right",
      render: (item) => (
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {formatAmount(item.p75_amount)}
        </span>
      ),
    },
    {
      key: "max",
      label: "Max",
      sortable: false,
      align: "right",
      render: (item) =>
        item.max_amount !== null && item.p75_amount !== null && item.max_amount > item.p75_amount * 2 ? (
          <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">
            {formatAmount(item.max_amount)}
          </span>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">
            {formatAmount(item.max_amount)}
          </span>
        ),
    },
    {
      key: "spread",
      label: "Range",
      sortable: true,
      className: "min-w-[120px]",
      render: (item) => {
        const spread =
          item.max_amount !== null && item.min_amount !== null
            ? item.max_amount - item.min_amount
            : null;
        const p25 = item.p25_amount ?? 0;
        const p75 = item.p75_amount ?? 0;
        const barLeft = globalMax > 0 ? (p25 / globalMax) * 100 : 0;
        const barWidth = globalMax > 0 ? Math.max(((p75 - p25) / globalMax) * 100, 1) : 0;
        const family = getFeeFamily(item.fee_category);
        const colors = family ? getFamilyColor(family) : null;
        return item.p25_amount !== null && item.p75_amount !== null ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden relative">
              <div
                className={`absolute h-full rounded-full opacity-60 ${
                  colors ? colors.border.replace("border-l-", "bg-") : "bg-gray-400"
                }`}
                style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 w-12 text-right flex-shrink-0">
              {formatAmount(spread)}
            </span>
          </div>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">-</span>
        );
      },
    },
    {
      key: "banks",
      label: "Banks",
      sortable: false,
      align: "center",
      render: (item) =>
        item.bank_count > 0 ? (
          <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
            {item.bank_count}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">-</span>
        ),
    },
    {
      key: "cus",
      label: "CUs",
      sortable: false,
      align: "center",
      render: (item) =>
        item.cu_count > 0 ? (
          <span className="inline-block rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {item.cu_count}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">-</span>
        ),
    },
  ];

  // Preserve filter params for sort/pagination links
  const filterParams: Record<string, string> = {};
  if (showFeatured) filterParams.show = "featured";
  if (activeFamily) filterParams.family = activeFamily;
  if (searchTerm) filterParams.search = searchTerm;

  return (
    <>
      <div className="mb-6">
        <div className="print:hidden">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/admin" },
              { label: "Fee Catalog" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Fee Catalog
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {totalCategories} fee types across{" "}
              {totalObservations.toLocaleString()} observations
            </p>
          </div>
          <CatalogActions />
        </div>
      </div>

      {/* Insight cards */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div className="admin-card px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Categories
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
              {totalCategories}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              of {showFeatured ? FEATURED_COUNT : TAXONOMY_COUNT}{" "}
              {showFeatured ? "featured" : "total"}
            </p>
          </div>
          {mostCommon && (
            <Link
              href={`/admin/fees/catalog/${mostCommon.fee_category}`}
              className="admin-card px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Most Common
              </p>
              <p className="text-lg font-bold text-gray-900 mt-1 truncate">
                {getDisplayName(mostCommon.fee_category)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                {mostCommon.institution_count} institutions
              </p>
            </Link>
          )}
          {highestMedian && (
            <Link
              href={`/admin/fees/catalog/${highestMedian.fee_category}`}
              className="admin-card px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Highest Median
              </p>
              <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
                {formatAmount(highestMedian.median_amount)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {getDisplayName(highestMedian.fee_category)}
              </p>
            </Link>
          )}
          {widestSpread && (
            <Link
              href={`/admin/fees/catalog/${widestSpread.fee_category}`}
              className="admin-card px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Widest Spread
              </p>
              <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
                {formatAmount(
                  (widestSpread.max_amount ?? 0) -
                    (widestSpread.min_amount ?? 0)
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {getDisplayName(widestSpread.fee_category)}
              </p>
            </Link>
          )}
        </div>
      )}

      {/* Sticky filter bar */}
      <Suspense fallback={null}>
        <CatalogFilterBar families={allFamilies} />
      </Suspense>

      {/* Flat table with inline family colors */}
      <div className="admin-card overflow-hidden">
        {summaries.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No fee categories found
            {searchTerm ? ` matching "${searchTerm}"` : ""}.
          </div>
        ) : (
          <ServerSortableTable
            columns={catalogColumns}
            rows={paginatedSummaries}
            rowKey={(r) => r.fee_category}
            basePath="/admin/fees/catalog"
            sort={sortKey}
            dir={sortDir as "asc" | "desc"}
            page={currentPage}
            perPage={perPage}
            totalItems={summaries.length}
            params={filterParams}
            caption="Fee catalog"
          />
        )}
      </div>
    </>
  );
}

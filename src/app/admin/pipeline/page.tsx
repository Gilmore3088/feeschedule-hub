import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getPipelineStats, getCoverageGaps, getRecentCrawls, getDistinctStates } from "@/lib/crawler-db";
import { getDataQualityReport } from "@/lib/crawler-db";
import { formatAssets, timeAgo } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { CoverageTable, BulkImportForm, StateFilter } from "./coverage-table";
import { PipelineDashboard } from "./pipeline-data";
import { DataSourcesStatus } from "./data-sources-status";
import { RecentJobs } from "./recent-jobs";
import { CategoryCoverageDashboard } from "./category-coverage-data";
import { QuickActions } from "./quick-actions";
import { RecentPriceChanges } from "./price-changes";
import { CoverageTrend } from "./coverage-trend";
import { AddInstitutionForm } from "./add-institution";

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { value: "", label: "All Gaps" },
  { value: "no_url", label: "No URL" },
  { value: "no_fees", label: "No Fees" },
  { value: "failing", label: "Failing" },
  { value: "stale", label: "Stale" },
] as const;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    charter?: string;
    state?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const activeStatus = params.status || "";
  const activeCharter = params.charter || "";
  const activeState = params.state || "";
  const searchQuery = params.q || "";
  const sortColumn = params.sort || "asset_size";
  const sortDir = params.dir || "desc";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const stats = getPipelineStats();
  const quality = getDataQualityReport();
  const states = getDistinctStates();
  const recentCrawls = getRecentCrawls(10);

  const { institutions, total } = getCoverageGaps({
    status: activeStatus || undefined,
    charter: activeCharter || undefined,
    state: activeState || undefined,
    search: searchQuery || undefined,
    sort: sortColumn,
    dir: sortDir,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Funnel percentages
  const funnel = [
    { label: "Total", count: stats.total_institutions, pct: 100 },
    { label: "Website", count: stats.with_website, pct: Math.round((stats.with_website / stats.total_institutions) * 100) },
    { label: "Fee URL", count: stats.with_fee_url, pct: Math.round((stats.with_fee_url / stats.total_institutions) * 100) },
    { label: "With Fees", count: stats.with_fees, pct: Math.round((stats.with_fees / stats.total_institutions) * 100) },
    { label: "Approved", count: stats.with_approved, pct: Math.round((stats.with_approved / stats.total_institutions) * 100) },
  ];

  // Build filter URL helper
  function filterUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = {
      status: activeStatus,
      charter: activeCharter,
      state: activeState,
      q: searchQuery,
      sort: sortColumn,
      dir: sortDir,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/admin/pipeline?${p.toString()}`;
  }

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Pipeline" },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Data Pipeline
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Coverage gaps, pipeline health, and data quality
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AddInstitutionForm />
            <BulkImportForm />
          </div>
        </div>
      </div>

      {/* Unified Pipeline Dashboard */}
      <div className="mb-4">
        <PipelineDashboard />
      </div>

      {/* Quick Actions - all pipeline commands in one place */}
      <div className="mb-4">
        <QuickActions />
      </div>

      {/* Recent Jobs */}
      <div className="mb-4">
        <RecentJobs />
      </div>

      {/* Coverage Trend (only shows if 2+ snapshots exist) */}
      <div className="mb-4">
        <CoverageTrend />
      </div>

      {/* Price Changes (only shows if there are change events) */}
      <div className="mb-4">
        <RecentPriceChanges />
      </div>

      {/* Category Coverage */}
      <div className="mb-4">
        <CategoryCoverageDashboard />
      </div>

      {/* Data Sources */}
      <div className="mb-4">
        <DataSourcesStatus />
      </div>

      {/* Quality + Pipeline Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Missing URLs</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
            {(stats.total_institutions - stats.with_fee_url).toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-400">{Math.round(((stats.total_institutions - stats.with_fee_url) / stats.total_institutions) * 100)}% of total</p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Failing</p>
          <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400 mt-1">
            {stats.failing_count}
          </p>
          <p className="text-[10px] text-gray-400">&gt;3 consecutive failures</p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stale</p>
          <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {stats.stale_count}
          </p>
          <p className="text-[10px] text-gray-400">&gt;90 days since crawl</p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Uncategorized</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
            {quality.uncategorized_fees.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-400">fees without category</p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Null Amounts</p>
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
            {quality.null_amounts.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-400">non-free fees</p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Duplicates</p>
          <p className="text-lg font-bold tabular-nums mt-1 text-gray-900 dark:text-gray-100">
            {quality.duplicate_fees.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">0</span>
            ) : (
              <span className="text-red-600 dark:text-red-400">{quality.duplicate_fees.length}</span>
            )}
          </p>
          <p className="text-[10px] text-gray-400">duplicate fee names</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-white/[0.06] p-0.5">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={filterUrl({ status: f.value, page: "" })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeStatus === f.value
                  ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Charter filter */}
        <div className="flex gap-1">
          {[
            { value: "", label: "All" },
            { value: "bank", label: "Banks" },
            { value: "credit_union", label: "CUs" },
          ].map((f) => (
            <Link
              key={f.value}
              href={filterUrl({ charter: f.value, page: "" })}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeCharter === f.value
                  ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-white/10 dark:text-gray-400"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* State dropdown */}
        <StateFilter
          states={states}
          activeState={activeState}
          activeStatus={activeStatus}
          activeCharter={activeCharter}
          searchQuery={searchQuery}
        />

        {/* Search */}
        <form action="/admin/pipeline" method="get" className="flex items-center gap-1">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          {activeCharter && <input type="hidden" name="charter" value={activeCharter} />}
          {activeState && <input type="hidden" name="state" value={activeState} />}
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search institutions..."
            className="rounded border border-gray-200 px-2.5 py-1 text-[11px] w-48
                       dark:border-white/10 dark:bg-[oklch(0.18_0_0)] dark:text-gray-200
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          {searchQuery && (
            <Link
              href={filterUrl({ q: "" })}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear
            </Link>
          )}
        </form>

        <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
          {total.toLocaleString()} institutions
        </span>
      </div>

      {/* Coverage Gaps Table */}
      <CoverageTable
        institutions={institutions}
        total={total}
        sortColumn={sortColumn}
        sortDir={sortDir}
      />

      <div className="px-4 pb-3">
        <Pagination
          basePath="/admin/pipeline"
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={total}
          pageSize={PAGE_SIZE}
          params={{
            ...(activeStatus ? { status: activeStatus } : {}),
            ...(activeCharter ? { charter: activeCharter } : {}),
            ...(activeState ? { state: activeState } : {}),
            ...(searchQuery ? { q: searchQuery } : {}),
            sort: sortColumn,
            dir: sortDir,
          }}
        />
      </div>

    </>
  );
}

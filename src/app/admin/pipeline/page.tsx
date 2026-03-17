import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getPipelineStats, getCoverageGaps, getDistinctStates } from "@/lib/crawler-db";
import { getDataQualityReport } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { CoverageTable, BulkImportForm, StateFilter } from "./coverage-table";
import { RecentJobs } from "./recent-jobs";
import { QuickActions } from "./quick-actions";
import { AddInstitutionForm } from "./add-institution";
import { PipelineRunsPanel } from "./pipeline-runs";
import { IndexCacheCard } from "./index-cache-card";
import { DiscoveryStats } from "./discovery-stats";

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

  // Funnel data
  const t = stats.total_institutions || 1;
  const funnel = [
    { label: "Total", count: stats.total_institutions, pct: 100, color: "bg-gray-300 dark:bg-gray-600" },
    { label: "Website", count: stats.with_website, pct: Math.round((stats.with_website / t) * 100), color: "bg-blue-400" },
    { label: "Fee URL", count: stats.with_fee_url, pct: Math.round((stats.with_fee_url / t) * 100), color: "bg-amber-400" },
    { label: "Fees", count: stats.with_fees, pct: Math.round((stats.with_fees / t) * 100), color: "bg-emerald-400" },
    { label: "Approved", count: stats.with_approved, pct: Math.round((stats.with_approved / t) * 100), color: "bg-emerald-600" },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Pipeline" }]} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Data Pipeline</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Pipeline runs, coverage, and data quality</p>
          </div>
          <div className="flex items-center gap-2">
            <AddInstitutionForm />
            <BulkImportForm />
          </div>
        </div>
      </div>

      {/* === ROW 1: Pipeline Runs (full width hero) === */}
      <div className="mb-5">
        <PipelineRunsPanel />
      </div>

      {/* === ROW 2: Two-column layout === */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">

        {/* LEFT: Coverage funnel + Health metrics (span 4) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Coverage Funnel */}
          <div className="admin-card p-4">
            <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Coverage Funnel</h2>
            <div className="space-y-2">
              {funnel.map((step) => (
                <div key={step.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">{step.label}</span>
                    <span className="text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {step.count.toLocaleString()}
                      <span className="text-gray-400 font-normal ml-1">{step.pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${step.color} transition-all`} style={{ width: `${step.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Health Metrics */}
          <div className="admin-card p-4">
            <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Health</h2>
            <div className="grid grid-cols-2 gap-3">
              <HealthMetric label="Missing URLs" value={stats.total_institutions - stats.with_fee_url} pct={Math.round(((stats.total_institutions - stats.with_fee_url) / t) * 100)} />
              <HealthMetric label="Failing" value={stats.failing_count} color="text-red-600 dark:text-red-400" sub=">3 failures" />
              <HealthMetric label="Stale" value={stats.stale_count} color="text-amber-600 dark:text-amber-400" sub=">90 days" />
              <HealthMetric label="Uncategorized" value={quality.uncategorized_fees} />
              <HealthMetric label="Null Amounts" value={quality.null_amounts} />
              <HealthMetric label="Duplicates" value={quality.duplicate_fees.length} color={quality.duplicate_fees.length === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
            </div>
          </div>

          {/* Quick Actions */}
          <QuickActions />

          {/* Discovery Quality */}
          <DiscoveryStats />
        </div>

        {/* RIGHT: Index Cache + Recent Jobs (span 8) */}
        <div className="lg:col-span-8 space-y-4">
          <IndexCacheCard />
          <RecentJobs />
        </div>
      </div>

      {/* === ROW 3: Coverage Gaps Table (full width) === */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex flex-wrap items-center gap-2">
          {/* Status tabs */}
          <div className="flex gap-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] p-0.5">
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

          {/* Charter */}
          <div className="flex gap-0.5">
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

          <StateFilter states={states} activeState={activeState} activeStatus={activeStatus} activeCharter={activeCharter} searchQuery={searchQuery} />

          <form action="/admin/pipeline" method="get" className="flex items-center gap-1">
            {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
            {activeCharter && <input type="hidden" name="charter" value={activeCharter} />}
            {activeState && <input type="hidden" name="state" value={activeState} />}
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search..."
              className="rounded border border-gray-200 px-2.5 py-1 text-[11px] w-40
                         dark:border-white/10 dark:bg-[oklch(0.18_0_0)] dark:text-gray-200
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            {searchQuery && (
              <Link href={filterUrl({ q: "" })} className="text-[10px] text-gray-400 hover:text-gray-600">Clear</Link>
            )}
          </form>

          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">{total.toLocaleString()} institutions</span>
        </div>

        <CoverageTable institutions={institutions} total={total} sortColumn={sortColumn} sortDir={sortDir} />

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
      </div>
    </>
  );
}

function HealthMetric({
  label, value, color, sub, pct,
}: {
  label: string;
  value: number;
  color?: string;
  sub?: string;
  pct?: number;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-base font-bold tabular-nums mt-0.5 ${color || "text-gray-900 dark:text-gray-100"}`}>
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      {pct !== undefined && <p className="text-[10px] text-gray-400">{pct}% of total</p>}
    </div>
  );
}

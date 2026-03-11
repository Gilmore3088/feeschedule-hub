import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getCoverageStats,
  getCoverageHeatmap,
  getTriageQueue,
  getFailureReasonBreakdown,
  getPipelineHealth,
} from "@/lib/crawler-db";
import { TriageTable } from "./triage-table";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { TIER_ORDER, TIER_LABELS, DISTRICT_NAMES } from "@/lib/fed-districts";
import { OpsFilters } from "./ops-filters";
import { CsvUpload } from "./csv-upload";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function CoverageCell({ coverage, total }: { coverage: number; total: number }) {
  if (total === 0) {
    return (
      <td className="px-2 py-1.5 text-center text-[11px] text-gray-300 dark:text-gray-600">
        -
      </td>
    );
  }
  const bg =
    coverage >= 0.5
      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      : coverage >= 0.2
        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";

  return (
    <td className={`px-2 py-1.5 text-center text-[11px] font-medium tabular-nums ${bg}`}>
      {pct(coverage)}
      <span className="block text-[9px] opacity-60">{total}</span>
    </td>
  );
}

const FAILURE_REASON_LABELS: Record<string, string> = {
  wrong_url: "Wrong URL",
  account_agreement: "Account Agreement",
  login_required: "Login Required",
  pdf_scanned: "Scanned PDF",
  pdf_complex: "Complex PDF",
  html_dynamic: "Dynamic/JS Content",
  multiple_links: "Multiple Links",
  no_fees_found: "No Fees Found",
  site_down: "Site Down / 404",
};

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<{
    charter?: string;
    tier?: string;
    district?: string;
    reason?: string;
    page?: string;
    heatmap?: string;
  }>;
}) {
  await requireAuth("view");
  const params = await searchParams;

  const filterOpts = {
    charterType: params.charter || undefined,
    tier: params.tier || undefined,
    district: params.district || undefined,
  };

  const stats = getCoverageStats(filterOpts);
  const heatmap = getCoverageHeatmap({ charterType: params.charter || undefined });
  const pipeline = getPipelineHealth(filterOpts);
  const failureBreakdown = getFailureReasonBreakdown(filterOpts);

  const currentPage = Math.max(1, Number(params.page) || 1);
  const pageSize = 50;
  const { entries: triageEntries, total: triageTotal } = getTriageQueue({
    ...filterOpts,
    failureReason: params.reason || undefined,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  });

  // Build heatmap grid
  const heatmapMap = new Map<string, { total: number; coverage_pct: number }>();
  for (const cell of heatmap) {
    heatmapMap.set(`${cell.tier}-${cell.district}`, {
      total: cell.total,
      coverage_pct: cell.coverage_pct,
    });
  }
  const districts = Array.from({ length: 12 }, (_, i) => i + 1);
  const heatmapMode = params.heatmap === "district" ? "district" : "tier";

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Coverage Ops" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Coverage Operations
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Fee extraction coverage across {stats.total_institutions.toLocaleString()} institutions
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Total Institutions
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
            {stats.total_institutions.toLocaleString()}
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            With Fee URL
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
            {stats.with_fee_url.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {pct(stats.total_institutions > 0 ? stats.with_fee_url / stats.total_institutions : 0)} of total
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            With Extracted Fees
          </p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {stats.with_fees.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {pct(stats.coverage_pct)} coverage
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            URL but No Fees
          </p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">
            {pipeline.with_fee_url_no_fees.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            need triage
          </p>
        </div>
        <div className="admin-card px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Crawl Failing
          </p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {pipeline.crawl_failing.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            consecutive failures
          </p>
        </div>
      </div>

      {/* Filters */}
      <Suspense fallback={null}>
        <OpsFilters />
      </Suspense>

      {/* Coverage by Charter + Tier breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Coverage by Charter Type
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {stats.by_charter.map((c) => {
              const covPct = c.total > 0 ? c.with_fees / c.total : 0;
              return (
                <div key={c.charter_type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {c.charter_type === "bank" ? "Banks" : "Credit Unions"}
                    </span>
                    <span className="text-xs tabular-nums text-gray-500">
                      {c.with_fees.toLocaleString()} / {c.total.toLocaleString()} ({pct(covPct)})
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
                      style={{ width: pct(covPct) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Coverage by Asset Tier
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {TIER_ORDER.slice().reverse().map((tier) => {
              const match = stats.by_tier.find((t) => t.tier === tier);
              if (!match) return null;
              const covPct = match.total > 0 ? match.with_fees / match.total : 0;
              return (
                <div key={tier}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {TIER_LABELS[tier]}
                    </span>
                    <span className="text-xs tabular-nums text-gray-500">
                      {match.with_fees.toLocaleString()} / {match.total.toLocaleString()} ({pct(covPct)})
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
                      style={{ width: pct(covPct) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Heatmap: Tier x District (toggleable) */}
      <div className="admin-card overflow-hidden mb-6">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Coverage Heatmap
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Green = 50%+ coverage, Amber = 20-50%, Red = under 20%
            </p>
          </div>
          <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
            <Link
              href={`/admin/ops?${new URLSearchParams({
                ...(params.charter ? { charter: params.charter } : {}),
                ...(params.tier ? { tier: params.tier } : {}),
                ...(params.district ? { district: params.district } : {}),
              }).toString()}`}
              className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                heatmapMode === "tier"
                  ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              By Tier
            </Link>
            <Link
              href={`/admin/ops?${new URLSearchParams({
                ...(params.charter ? { charter: params.charter } : {}),
                ...(params.tier ? { tier: params.tier } : {}),
                ...(params.district ? { district: params.district } : {}),
                heatmap: "district",
              }).toString()}`}
              className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                heatmapMode === "district"
                  ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              By District
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          {heatmapMode === "tier" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 dark:bg-gray-900 z-10 min-w-[160px]">
                    Tier
                  </th>
                  {districts.map((d) => (
                    <th
                      key={d}
                      className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center min-w-[60px]"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_ORDER.slice().reverse().map((tier) => (
                  <tr key={tier} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-900 z-10">
                      {TIER_LABELS[tier]}
                    </td>
                    {districts.map((d) => {
                      const cell = heatmapMap.get(`${tier}-${d}`);
                      return (
                        <CoverageCell
                          key={d}
                          coverage={cell?.coverage_pct ?? 0}
                          total={cell?.total ?? 0}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 dark:bg-gray-900 z-10 min-w-[120px]">
                    District
                  </th>
                  {TIER_ORDER.slice().reverse().map((tier) => (
                    <th
                      key={tier}
                      className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center min-w-[80px]"
                    >
                      {TIER_LABELS[tier].split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {districts.map((d) => (
                  <tr key={d} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-900 z-10">
                      {d} - {DISTRICT_NAMES[d]}
                    </td>
                    {TIER_ORDER.slice().reverse().map((tier) => {
                      const cell = heatmapMap.get(`${tier}-${d}`);
                      return (
                        <CoverageCell
                          key={tier}
                          coverage={cell?.coverage_pct ?? 0}
                          total={cell?.total ?? 0}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Failure reason breakdown + Pipeline health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Failure Reasons (URL but No Fees)
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {failureBreakdown.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                No failure classifications yet
              </p>
            ) : (
              failureBreakdown.map((fb, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {fb.failure_reason
                      ? FAILURE_REASON_LABELS[fb.failure_reason] ?? fb.failure_reason
                      : "Unclassified"}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {fb.count.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Pipeline Health
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {[
              { label: "Has URL, never crawled", value: pipeline.never_crawled, color: "text-gray-500" },
              { label: "Crawl OK, no fees extracted", value: pipeline.crawl_ok_no_fees, color: "text-red-600 dark:text-red-400" },
              { label: "Crawl failing (consecutive)", value: pipeline.crawl_failing, color: "text-amber-600 dark:text-amber-400" },
              { label: "Has website, no fee URL", value: pipeline.no_fee_url, color: "text-gray-500" },
              { label: "Has fee URL, no fees", value: pipeline.with_fee_url_no_fees, color: "text-red-600 dark:text-red-400" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
                <span className={`text-xs font-semibold tabular-nums ${item.color}`}>
                  {item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Triage queue */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Triage Queue
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {triageTotal.toLocaleString()} institutions with fee URL but no extracted fees, sorted by asset size
          </p>
        </div>
        <TriageTable entries={triageEntries} />

        {/* Pagination */}
        {triageTotal > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/[0.04]">
            <p className="text-xs text-gray-400">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, triageTotal)} of {triageTotal.toLocaleString()}
            </p>
            <div className="flex gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/admin/ops?${new URLSearchParams({
                    ...(params.charter ? { charter: params.charter } : {}),
                    ...(params.tier ? { tier: params.tier } : {}),
                    ...(params.district ? { district: params.district } : {}),
                    ...(params.reason ? { reason: params.reason } : {}),
                    page: String(currentPage - 1),
                  }).toString()}`}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  Previous
                </Link>
              )}
              {currentPage * pageSize < triageTotal && (
                <Link
                  href={`/admin/ops?${new URLSearchParams({
                    ...(params.charter ? { charter: params.charter } : {}),
                    ...(params.tier ? { tier: params.tier } : {}),
                    ...(params.district ? { district: params.district } : {}),
                    ...(params.reason ? { reason: params.reason } : {}),
                    page: String(currentPage + 1),
                  }).toString()}`}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSV Bulk URL Upload (admin only) */}
      <div className="admin-card overflow-hidden mt-6">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Bulk URL Update (CSV)
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Upload a CSV to update fee schedule URLs in bulk. Admin only, max 500 rows.
          </p>
        </div>
        <div className="p-4">
          <CsvUpload />
        </div>
      </div>
    </>
  );
}

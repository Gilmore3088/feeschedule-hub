export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getDashboardStats,
  getReviewQueueCounts,
  getRecentCrawlRuns,
  getRecentReviews,
  getCoverageByState,
  getDataQualityStats,
} from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SkeletonPage } from "@/components/skeleton";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function AdminDashboard() {
  await requireAuth("view");

  return (
    <>
      <div className="mb-5">
        <Breadcrumbs items={[{ label: "Dashboard" }]} />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Bank Fee Index admin overview
        </p>
      </div>

      <Suspense fallback={<SkeletonPage />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  let stats = { total_institutions: 0, with_fees: 0, with_urls: 0, coverage_pct: 0 };
  let queue = { staged: 0, flagged: 0, pending: 0, approved: 0, rejected: 0 };
  let crawlRuns: Awaited<ReturnType<typeof getRecentCrawlRuns>> = [];
  let reviews: Awaited<ReturnType<typeof getRecentReviews>> = [];
  let stateCoverage: Awaited<ReturnType<typeof getCoverageByState>> = [];
  let quality = { total_with_fees: 0, good_6plus: 0, incomplete_1to5: 0, url_no_fees: 0, no_url: 0, freeform_fees: 0, rejected_fees: 0, quality_pct: 0 };

  try {
    [stats, queue, crawlRuns, reviews, stateCoverage, quality] = await Promise.all([
      getDashboardStats(),
      getReviewQueueCounts(),
      getRecentCrawlRuns(10),
      getRecentReviews(15),
      getCoverageByState(),
      getDataQualityStats(),
    ]);
  } catch (e) {
    console.error("Dashboard data load failed:", e);
  }

  const totalReview = queue.staged + queue.flagged + queue.pending;

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8">
        <StatCard label="Total Institutions" value={formatNumber(stats.total_institutions)} />
        <StatCard label="With Fee URL" value={formatNumber(stats.with_urls)} />
        <StatCard label="With Fees" value={formatNumber(stats.with_fees)} />
        <StatCard label="Coverage" value={`${stats.coverage_pct}%`} highlight />
      </div>

      {/* Data Quality Panel */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Data Quality
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 dark:bg-white/[0.04]">
          <div className="bg-white dark:bg-[var(--dark-bg-card,oklch(0.15_0_0))] px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Credible (6+ fees)</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">{formatNumber(quality.good_6plus)}</p>
            <p className="text-[11px] text-gray-400">{quality.quality_pct}% quality rate</p>
          </div>
          <div className="bg-white dark:bg-[var(--dark-bg-card,oklch(0.15_0_0))] px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Incomplete (1-5 fees)</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{formatNumber(quality.incomplete_1to5)}</p>
            <p className="text-[11px] text-gray-400">need re-extraction</p>
          </div>
          <div className="bg-white dark:bg-[var(--dark-bg-card,oklch(0.15_0_0))] px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">URL, No Fees</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">{formatNumber(quality.url_no_fees)}</p>
            <p className="text-[11px] text-gray-400">extraction gap</p>
          </div>
          <div className="bg-white dark:bg-[var(--dark-bg-card,oklch(0.15_0_0))] px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">No URL</p>
            <p className="text-lg font-bold text-gray-600 dark:text-gray-400 mt-1 tabular-nums">{formatNumber(quality.no_url)}</p>
            <p className="text-[11px] text-gray-400">discovery gap</p>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 dark:border-white/[0.04] flex gap-4 text-[11px] text-gray-400">
          <span>Freeform fees: {formatNumber(quality.freeform_fees)}</span>
          <span>Rejected: {formatNumber(quality.rejected_fees)}</span>
        </div>
      </div>

      {/* Review Queue */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Review Queue
          </h2>
          <Link
            href="/admin/review"
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            Open Review &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-gray-100 dark:divide-white/[0.04]">
          <QueueCell label="Needs Review" value={totalReview} highlight={totalReview > 0} />
          <QueueCell label="Staged" value={queue.staged} />
          <QueueCell label="Flagged" value={queue.flagged} warn={queue.flagged > 0} />
          <QueueCell label="Pending" value={queue.pending} />
          <QueueCell label="Approved" value={queue.approved} />
          <QueueCell label="Rejected" value={queue.rejected} />
        </div>
      </div>

      {/* Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Recent Crawl Runs */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Recent Crawl Runs
            </h2>
            <Link
              href="/admin/pipeline"
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
            >
              Pipeline &rarr;
            </Link>
          </div>
          {crawlRuns.length > 0 ? (
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Date</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Targets</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {crawlRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="text-gray-700 dark:text-gray-300 tabular-nums">
                      {run.started_at}
                    </td>
                    <td className="text-center">
                      <StatusDot status={run.status} />
                    </td>
                    <td className="text-right tabular-nums text-gray-500">
                      {run.targets_crawled}
                    </td>
                    <td className="text-right tabular-nums text-gray-500">
                      {run.fees_extracted}
                    </td>
                    <td className="text-right tabular-nums text-gray-600 font-medium">
                      {run.success_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">No recent crawl runs</div>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Recent Reviews
            </h2>
            <Link
              href="/admin/review"
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
            >
              All Reviews &rarr;
            </Link>
          </div>
          {reviews.length > 0 ? (
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Reviewer</th>
                  <th>Action</th>
                  <th>Fee</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((rr, i) => (
                  <tr key={`${rr.fee_id}-${i}`}>
                    <td className="text-gray-600 dark:text-gray-400">
                      {rr.username ?? "system"}
                    </td>
                    <td>
                      <ActionBadge action={rr.action} />
                    </td>
                    <td>
                      <Link
                        href={`/admin/review/${rr.fee_id}`}
                        className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors"
                      >
                        {rr.fee_category ?? rr.fee_name}
                      </Link>
                      <span className="text-gray-400 ml-1 hidden sm:inline">
                        {rr.institution_name}
                      </span>
                    </td>
                    <td className="text-right text-gray-400 tabular-nums">{rr.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">No recent reviews</div>
          )}
        </div>
      </div>

      {/* Coverage by State */}
      {stateCoverage.length > 0 && (
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Coverage by State
            </h2>
          </div>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-1 p-3">
            {stateCoverage.map((s) => (
              <Link
                key={s.state_code}
                href={`/admin/states/${s.state_code}`}
                className="text-center rounded p-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                title={`${s.state_code}: ${s.with_fees} of ${s.total} (${s.pct}%)`}
              >
                <span className="text-[10px] font-bold text-gray-500">{s.state_code}</span>
                <div
                  className={`text-[11px] font-bold tabular-nums ${
                    s.pct >= 50
                      ? "text-emerald-600 dark:text-emerald-400"
                      : s.pct >= 20
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-400"
                  }`}
                >
                  {s.pct}%
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`admin-card p-4 ${highlight ? "ring-1 ring-blue-200/60 dark:ring-blue-800/40" : ""}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function QueueCell({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={`text-lg font-bold tabular-nums ${
          highlight
            ? "text-blue-600 dark:text-blue-400"
            : warn
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500"
      : status === "running"
        ? "bg-blue-500"
        : status === "failed"
          ? "bg-red-500"
          : "bg-gray-400";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] text-gray-500">{status}</span>
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, string> = {
    approve: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    reject: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    stage: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    flag: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    edit: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  const cls = config[action] ?? config.edit;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {action}
    </span>
  );
}

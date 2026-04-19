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
  getLeadsSummary,
} from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SkeletonPage } from "@/components/skeleton";

function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export default async function AdminDashboard() {
  await requireAuth("view");

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs items={[{ label: "Dashboard" }]} />
        <p className="admin-eyebrow mt-2">Admin · Overview</p>
        <h1 className="admin-display-title mt-1">Operations</h1>
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
  let leads: Awaited<ReturnType<typeof getLeadsSummary>> = { total: 0, new_this_week: 0, new_today: 0, latest_at: null };
  let loadFailed = false;
  let loadError: string | null = null;

  try {
    [stats, queue, crawlRuns, reviews, stateCoverage, quality, leads] = await Promise.all([
      getDashboardStats(),
      getReviewQueueCounts(),
      getRecentCrawlRuns(10),
      getRecentReviews(15),
      getCoverageByState(),
      getDataQualityStats(),
      getLeadsSummary(),
    ]);
  } catch (e) {
    console.error("Dashboard data load failed:", e);
    loadFailed = true;
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const totalReview = queue.staged + queue.flagged + queue.pending;

  return (
    <>
      {loadFailed && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/40 px-4 py-3"
        >
          <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">
            We couldn&rsquo;t load the dashboard.
          </p>
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
            {loadError
              ? `${loadError}. `
              : ""}
            Refresh to try again. Numbers below show zeros until the connection recovers.
          </p>
        </div>
      )}

      {/* Dashboard Hero — single statement, asymmetric split */}
      <section className="mb-12">
        <hr className="admin-rule-brand mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 sm:gap-10 items-start">
          <div className="sm:col-span-7">
            <p className="admin-eyebrow">Fee schedule coverage</p>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="admin-hero-figure">
                {Number.isFinite(stats.coverage_pct) ? stats.coverage_pct : 0}%
              </span>
              <span className="admin-meta">of {formatNumber(stats.total_institutions)} U.S. institutions</span>
            </div>
            <p className="admin-lede mt-3">
              {totalReview > 0
                ? `${formatNumber(totalReview)} fees are awaiting review.`
                : "Review queue is clear."}
            </p>
          </div>
          <div className="sm:col-span-5 sm:border-l sm:border-gray-200 dark:sm:border-white/[0.06] sm:pl-8 flex flex-col">
            <HeroStat
              label="Tracked institutions"
              value={formatNumber(stats.total_institutions)}
            />
            <HeroStat
              label="Fee URL found"
              value={formatNumber(stats.with_urls)}
              hint={
                stats.total_institutions > 0
                  ? `${Math.round((stats.with_urls / stats.total_institutions) * 100)}% of tracked`
                  : undefined
              }
            />
            <HeroStat
              label="Verified fee schedules"
              value={formatNumber(stats.with_fees)}
              hint={`${stats.coverage_pct}% coverage`}
            />
          </div>
        </div>
      </section>

      {/* Leads snapshot — compact widget above operational panels */}
      <section className="mb-6">
        <Link
          href="/admin/leads"
          className="admin-card block p-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Leads total
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">
                  {formatNumber(leads.total)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  This week
                </p>
                <p
                  className={`text-lg font-bold tabular-nums mt-0.5 ${
                    leads.new_this_week > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {leads.new_this_week > 0 ? "+" : ""}
                  {formatNumber(leads.new_this_week)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Today
                </p>
                <p
                  className={`text-lg font-bold tabular-nums mt-0.5 ${
                    leads.new_today > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {leads.new_today > 0 ? "+" : ""}
                  {formatNumber(leads.new_today)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Latest
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {leads.latest_at ?? "No leads yet"}
              </p>
            </div>
          </div>
        </Link>
      </section>

      {/* Operational panels: Data Quality + Review Queue pair on xl */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
        {/* Data Quality Panel */}
        <div className="admin-card overflow-hidden">
          <div className="admin-panel-header">
            <h2 className="admin-section-title">Data Quality</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-white/[0.06]">
            <QualityCell
              label="Credible (6+ fees)"
              value={formatNumber(quality.good_6plus)}
              tone="emerald"
              hint={`${quality.quality_pct}% quality rate`}
            />
            <QualityCell
              label="Incomplete (1-5 fees)"
              value={formatNumber(quality.incomplete_1to5)}
              tone="amber"
              hint="need re-extraction"
            />
            <QualityCell
              label="URL, No Fees"
              value={formatNumber(quality.url_no_fees)}
              tone="red"
              hint="extraction gap"
            />
            <QualityCell
              label="No URL"
              value={formatNumber(quality.no_url)}
              tone="neutral"
              hint="discovery gap"
            />
          </div>
        </div>

        {/* Review Queue */}
        <div className="admin-card overflow-hidden">
          <div className="admin-panel-header">
            <h2 className="admin-section-title">Review Queue</h2>
            <Link href="/admin/review" className="admin-section-link">
              Open review &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-white/[0.06]">
            <QueueCell label="Needs Review" value={totalReview} highlight={totalReview > 0} />
            <QueueCell label="Staged" value={queue.staged} />
            <QueueCell label="Flagged" value={queue.flagged} warn={queue.flagged > 0} />
            <QueueCell label="Pending" value={queue.pending} />
          </div>
        </div>
      </div>

      {/* Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Recent Crawl Runs */}
        <div className="admin-card overflow-hidden">
          <div className="admin-panel-header">
            <h2 className="admin-section-title">Recent Crawl Runs</h2>
            <Link href="/admin/pipeline" className="admin-section-link">
              Open pipeline &rarr;
            </Link>
          </div>
          {crawlRuns.length > 0 ? (
            <div className="overflow-x-auto">
              <table aria-label="Recent crawl runs" className="admin-table w-full text-xs">
                <caption className="sr-only">
                  Ten most recent crawl runs with status, targets crawled, fees extracted, and success rate.
                </caption>
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
                      <td className="text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {run.targets_crawled}
                      </td>
                      <td className="text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {run.fees_extracted}
                      </td>
                      <td className="text-right tabular-nums text-gray-700 dark:text-gray-200 font-medium">
                        {run.success_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 admin-meta text-center">
              No crawl runs yet.{" "}
              <Link href="/admin/pipeline" className="admin-section-link">
                Start one &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="admin-card overflow-hidden">
          <div className="admin-panel-header">
            <h2 className="admin-section-title">Recent Reviews</h2>
          </div>
          {reviews.length > 0 ? (
            <div className="overflow-x-auto">
              <table
                aria-label="Recent reviews"
                className="admin-table w-full text-xs table-fixed"
              >
                <caption className="sr-only">
                  Fifteen most recent fee reviews with reviewer, action, fee and institution, and timestamp.
                </caption>
                <thead>
                  <tr className="text-left">
                    <th className="w-[18%]">Reviewer</th>
                    <th className="w-[14%]">Action</th>
                    <th>Fee</th>
                    <th className="w-[18%] text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((rr, i) => (
                    <tr key={`${rr.fee_id}-${i}`}>
                      <td className="text-gray-600 dark:text-gray-400 truncate">
                        {rr.username ?? "system"}
                      </td>
                      <td>
                        <ActionBadge action={rr.action} />
                      </td>
                      <td className="min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1 min-w-0">
                          <Link
                            href={`/admin/review/${rr.fee_id}`}
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors truncate"
                            title={rr.fee_category ?? rr.fee_name ?? undefined}
                          >
                            {rr.fee_category ?? rr.fee_name}
                          </Link>
                          {rr.institution_name && (
                            <span
                              className="admin-meta hidden sm:inline truncate"
                              title={rr.institution_name}
                            >
                              {rr.institution_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right admin-meta tabular-nums truncate">
                        {rr.created_at}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 admin-meta text-center">
              No reviews yet — decisions will appear here as the queue is worked.
            </div>
          )}
        </div>
      </div>

      {/* Coverage by State */}
      {stateCoverage.length > 0 && (
        <div className="admin-card overflow-hidden">
          <div className="admin-panel-header">
            <h2 className="admin-section-title">Coverage by State</h2>
          </div>
          <ul
            role="list"
            className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1 p-3"
          >
            {stateCoverage.map((s) => {
              const pctColor =
                s.pct >= 50
                  ? "text-emerald-700 dark:text-emerald-400"
                  : s.pct >= 20
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-gray-500 dark:text-gray-400";
              return (
                <li key={s.state_code}>
                  <Link
                    href={`/admin/states/${s.state_code}`}
                    aria-label={`${s.state_code}: ${s.with_fees} of ${s.total} institutions covered, ${s.pct} percent`}
                    className="block text-center rounded p-1.5 min-h-11 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="admin-label-xs block text-gray-700 dark:text-gray-300">
                      {s.state_code}
                    </span>
                    <span className={`block text-[11px] font-bold tabular-nums mt-0.5 ${pctColor}`}>
                      {s.pct}%
                    </span>
                    <span className="admin-label-xs block tabular-nums mt-0.5 normal-case tracking-normal font-medium">
                      {s.with_fees}/{s.total}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function HeroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-gray-200/70 dark:border-white/[0.06] first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="admin-label">{label}</p>
        {hint && <p className="admin-meta mt-0.5">{hint}</p>}
      </div>
      <p className="admin-hero-sub-value shrink-0">{value}</p>
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
  const valueColor = highlight
    ? "admin-text-brand"
    : warn
      ? "text-amber-600 dark:text-amber-400"
      : "text-gray-900 dark:text-gray-100";
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="admin-label mb-0.5">{label}</p>
      <p className={`admin-value ${valueColor}`}>{formatNumber(value)}</p>
    </div>
  );
}

function QualityCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "amber" | "red" | "neutral";
}) {
  const valueColor =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "red"
          ? "text-red-600 dark:text-red-400"
          : "text-gray-700 dark:text-gray-300";
  return (
    <div className="px-4 py-3">
      <p className="admin-label">{label}</p>
      <p className={`admin-value mt-1 ${valueColor}`}>{value}</p>
      <p className="admin-sublabel">{hint}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const config =
    status === "completed"
      ? {
          dot: "bg-emerald-500",
          text: "text-emerald-700 dark:text-emerald-400",
          glyph: "✓",
        }
      : status === "running"
        ? {
            dot: "bg-blue-500",
            text: "text-blue-700 dark:text-blue-400",
            glyph: "●",
          }
        : status === "failed"
          ? {
              dot: "bg-red-500",
              text: "text-red-700 dark:text-red-400",
              glyph: "×",
            }
          : {
              dot: "bg-gray-400",
              text: "text-gray-600 dark:text-gray-400",
              glyph: "–",
            };
  const isLive = status === "running";
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={`Status: ${status}`}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex items-center justify-center w-3.5 h-3.5 shrink-0"
      >
        {isLive && (
          <span
            className={`absolute inset-0 rounded-full ${config.dot} live-pulse pointer-events-none`}
          />
        )}
        <span
          className={`relative z-10 inline-flex items-center justify-center w-full h-full rounded-full ${config.dot} text-white text-[9px] leading-none font-bold`}
        >
          {config.glyph}
        </span>
      </span>
      <span className={`text-[10px] font-medium ${config.text}`}>{status}</span>
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

import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getReviewStats,
  getCrawlHealth,
  getStuckReviewItems,
  getPeerFilteredStats,
  getDistrictMetrics,
  getVolatileCategories,
  getRiskOutliers,
  getRecentCrawlActivity,
  getRecentReviews,
} from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { parsePeerFilters } from "@/lib/fed-districts";
import { getDisplayName, getFeeFamily, getFamilyColor } from "@/lib/fee-taxonomy";
import { PeerFiltersBar } from "@/components/peer-filters-bar";
import { ReviewQueueHero } from "@/components/review-queue-hero";
import { CrawlStatusStrip } from "@/components/crawl-status-strip";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    charter?: string;
    tier?: string;
    district?: string;
    range?: string;
    focus?: string;
    mapMetric?: string;
  }>;
}) {
  const user = await requireAuth("view");

  const params = await searchParams;
  const peerFilters = parsePeerFilters(params);

  const dbFilters = {
    charter_type: peerFilters.charter,
    asset_tier: peerFilters.tier,
    fed_districts: peerFilters.districts,
  };

  // Global queries (not affected by peer filters)
  const reviewStats = getReviewStats();
  const stuckItems = getStuckReviewItems();
  const crawlHealth = getCrawlHealth();
  const recentReviews = getRecentReviews(15);

  // Peer-filtered queries
  const peerStats = getPeerFilteredStats(dbFilters);
  const districtMetrics = getDistrictMetrics({
    charter_type: peerFilters.charter,
    asset_tier: peerFilters.tier,
  });
  const volatileCategories = getVolatileCategories(dbFilters, 10);
  const riskOutliers = getRiskOutliers(dbFilters);
  const recentCrawls = getRecentCrawlActivity(dbFilters, 20);

  const hasFilters = peerFilters.charter || peerFilters.tier || peerFilters.districts;

  return (
    <>
      {/* Peer Filters Bar */}
      <Suspense fallback={null}>
        <PeerFiltersBar />
      </Suspense>

      {/* Row 1: Command Center - Review Queue + Crawl Health */}
      <div className="space-y-4 mb-8">
        <ReviewQueueHero
          stats={reviewStats}
          stuck={stuckItems}
          isAdmin={user.role === "admin"}
        />
        <CrawlStatusStrip health={crawlHealth} />
      </div>

      {/* Row 2: Health Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <HealthTile
          label="Total Institutions"
          value={peerStats.total_institutions.toLocaleString()}
          global={!hasFilters}
        />
        <HealthTile
          label="With Website"
          value={peerStats.with_website.toLocaleString()}
          sub={
            peerStats.total_institutions > 0
              ? `${((peerStats.with_website / peerStats.total_institutions) * 100).toFixed(0)}%`
              : "0%"
          }
        />
        <HealthTile
          label="With Fee URL"
          value={peerStats.with_fee_url.toLocaleString()}
          sub={
            peerStats.total_institutions > 0
              ? `${((peerStats.with_fee_url / peerStats.total_institutions) * 100).toFixed(0)}% coverage`
              : "0%"
          }
          highlight
        />
        <HealthTile
          label="Fees Extracted"
          value={peerStats.total_fees.toLocaleString()}
          href="/admin/fees"
        />
      </div>

      {/* Row 3: Peer Intelligence - Map + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Fed District Map placeholder - will be replaced in Phase 3 */}
        <div className="lg:col-span-2 rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Peer Intelligence (Fed Districts)
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                Fed Districts
              </span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded cursor-not-allowed">
                States (coming soon)
              </span>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {districtMetrics.map((dm) => {
                const isSelected = peerFilters.districts?.includes(dm.district);
                return (
                  <Link
                    key={dm.district}
                    href={`/admin?${new URLSearchParams({
                      ...(peerFilters.charter ? { charter: peerFilters.charter } : {}),
                      ...(peerFilters.tier ? { tier: peerFilters.tier } : {}),
                      district: String(dm.district),
                    }).toString()}`}
                    className={`rounded-lg border p-3 text-sm transition hover:shadow-sm ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                        : "hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">
                        {dm.district}
                      </span>
                      <span className="text-xs text-gray-500">{dm.name}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <span className="text-gray-500">Inst.</span>{" "}
                        <span className="font-medium text-gray-700">
                          {dm.institution_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">URL%</span>{" "}
                        <span className="font-medium text-gray-700">
                          {(dm.fee_url_pct * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Fees</span>{" "}
                        <span className="font-medium text-gray-700">
                          {dm.total_fees}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Conf.</span>{" "}
                        <span className="font-medium text-gray-700">
                          {(dm.avg_confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Peer Summary Panel */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">
              Peer Set Summary
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {peerFilters.districts?.length
                ? `District ${peerFilters.districts.join(", ")}`
                : "All Districts"}
              {peerFilters.charter
                ? ` | ${peerFilters.charter === "bank" ? "Banks" : "Credit Unions"}`
                : ""}
              {peerFilters.tier ? ` | ${peerFilters.tier}` : ""}
            </p>
          </div>
          <div className="p-5 space-y-4">
            <SummaryKPI
              label="Institutions"
              value={peerStats.total_institutions.toLocaleString()}
            />
            <SummaryKPI
              label="Fee URL Coverage"
              value={
                peerStats.total_institutions > 0
                  ? `${((peerStats.with_fee_url / peerStats.total_institutions) * 100).toFixed(1)}%`
                  : "0%"
              }
            />
            <SummaryKPI
              label="Fees Extracted"
              value={peerStats.total_fees.toLocaleString()}
            />
            <SummaryKPI
              label="Banks"
              value={peerStats.banks.toLocaleString()}
            />
            <SummaryKPI
              label="Credit Unions"
              value={peerStats.credit_unions.toLocaleString()}
            />

            <div className="pt-3 border-t">
              <Link
                href={`/admin/peers${peerFilters.districts?.length ? `?district=${peerFilters.districts[0]}` : ""}`}
                className="text-sm text-blue-600 hover:underline"
              >
                View peers
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Insights - Volatile Categories + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Volatile fee categories */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">
              Most Volatile Fee Categories
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Ranked by interquartile range (IQR)
            </p>
          </div>
          {volatileCategories.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Fee Type</th>
                    <th className="px-4 py-2 font-medium text-right">Inst.</th>
                    <th className="px-4 py-2 font-medium text-right">Median</th>
                    <th className="px-4 py-2 font-medium text-right">IQR</th>
                    <th className="px-4 py-2 font-medium text-right">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {volatileCategories.map((vc) => {
                    const family = getFeeFamily(vc.fee_category);
                    const colors = family ? getFamilyColor(family) : null;
                    return (
                      <tr
                        key={vc.fee_category}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/fees/catalog/${vc.fee_category}`}
                            className="text-blue-600 hover:underline font-medium text-xs"
                          >
                            {getDisplayName(vc.fee_category)}
                          </Link>
                          {family && colors && (
                            <span
                              className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}
                            >
                              {family}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {vc.institution_count}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-900">
                          {formatAmount(vc.median_amount)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">
                          {formatAmount(vc.iqr)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-500">
                          {formatAmount(vc.range_width)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 text-center">
              No fee data available for current filters
            </div>
          )}
        </div>

        {/* Risk & Outliers */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">
              Risk & Outliers
            </h2>
          </div>
          <div className="p-4 space-y-5">
            {/* Top flagged categories */}
            {riskOutliers.top_flagged_categories.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Top Flagged Categories
                </h3>
                <div className="space-y-1.5">
                  {riskOutliers.top_flagged_categories.map((fc) => (
                    <Link
                      key={fc.fee_category}
                      href={`/admin/review?status=flagged`}
                      className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-2 py-1 -mx-2"
                    >
                      <span className="text-gray-700">
                        {getDisplayName(fc.fee_category)}
                      </span>
                      <span className="text-xs">
                        <span className="text-orange-600 font-medium">
                          {fc.flagged_count}
                        </span>
                        <span className="text-gray-400">
                          /{fc.total_count}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Repeated crawl failures */}
            {riskOutliers.repeated_failures.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Repeated Crawl Failures
                </h3>
                <div className="space-y-1.5">
                  {riskOutliers.repeated_failures.slice(0, 5).map((rf) => (
                    <Link
                      key={rf.id}
                      href={`/admin/peers/${rf.id}`}
                      className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-2 py-1 -mx-2"
                    >
                      <span className="text-gray-700 truncate max-w-[200px]">
                        {rf.institution_name}
                      </span>
                      <span className="text-xs text-red-600 font-medium">
                        {rf.consecutive_failures}x failed
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Extreme outlier fees */}
            {riskOutliers.extreme_outlier_fees.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Extreme Outlier Fees
                </h3>
                <div className="space-y-1.5">
                  {riskOutliers.extreme_outlier_fees.map((of) => (
                    <Link
                      key={of.id}
                      href={`/admin/review/${of.id}`}
                      className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-2 py-1 -mx-2"
                    >
                      <div>
                        <span className="text-gray-700">
                          {getDisplayName(of.fee_category ?? of.fee_name)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">
                          {of.institution_name}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-semibold text-red-600">
                        {formatAmount(of.amount)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {riskOutliers.top_flagged_categories.length === 0 &&
              riskOutliers.repeated_failures.length === 0 &&
              riskOutliers.extreme_outlier_fees.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No risk items for current filters
                </p>
              )}
          </div>
        </div>
      </div>

      {/* Row 5: Operational Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recently Crawled (peer-filtered) */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">
              Recently Crawled
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasFilters ? "Filtered by peer set" : "All institutions"}
            </p>
          </div>
          {recentCrawls.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Institution</th>
                    <th className="px-4 py-2 font-medium text-center">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Fees</th>
                    <th className="px-4 py-2 font-medium text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCrawls.slice(0, 10).map((rc, i) => (
                    <tr
                      key={`${rc.crawl_target_id}-${i}`}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/peers/${rc.crawl_target_id}`}
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
                          {rc.institution_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <CrawlStatusBadge status={rc.status} />
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        {rc.fees_extracted}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">
                        {rc.crawled_at?.slice(0, 10) ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 text-center">
              No recent crawl activity
            </div>
          )}
        </div>

        {/* Recently Reviewed (GLOBAL) */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">
              Recent Reviews
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Global activity feed
            </p>
          </div>
          {recentReviews.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Reviewer</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Fee</th>
                    <th className="px-4 py-2 font-medium text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReviews.map((rr, i) => (
                    <tr
                      key={`${rr.fee_id}-${i}`}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 text-gray-700 text-xs">
                        {rr.username ?? "system"}
                      </td>
                      <td className="px-4 py-2">
                        <ReviewActionBadge action={rr.action} />
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/review/${rr.fee_id}`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          {rr.fee_category
                            ? getDisplayName(rr.fee_category)
                            : rr.fee_name}
                        </Link>
                        <span className="text-xs text-gray-400 ml-1">
                          {rr.institution_name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">
                        {rr.created_at?.slice(0, 10) ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 text-center">
              No recent review activity
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function HealthTile({
  label,
  value,
  sub,
  highlight,
  href,
  global,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  href?: string;
  global?: boolean;
}) {
  const content = (
    <div
      className={`rounded-lg border bg-white px-4 py-3 transition-all ${
        href ? "hover:shadow-sm hover:border-gray-300 cursor-pointer" : ""
      } ${highlight ? "ring-1 ring-blue-100 border-blue-200" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        {global && (
          <span className="text-[10px] text-gray-400">global</span>
        )}
      </div>
      <p
        className={`text-2xl font-semibold mt-1 ${
          highlight ? "text-blue-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function SummaryKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function CrawlStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    unchanged: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function ReviewActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    approve: "bg-green-100 text-green-700",
    reject: "bg-red-100 text-red-700",
    edit: "bg-blue-100 text-blue-700",
    bulk_approve: "bg-green-100 text-green-700",
    flag: "bg-orange-100 text-orange-700",
    stage: "bg-blue-100 text-blue-700",
  };
  const labels: Record<string, string> = {
    approve: "Approved",
    reject: "Rejected",
    edit: "Edited",
    bulk_approve: "Bulk",
    flag: "Flagged",
    stage: "Staged",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        colors[action] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {labels[action] ?? action}
    </span>
  );
}

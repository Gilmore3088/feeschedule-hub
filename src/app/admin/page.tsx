export const dynamic = "force-dynamic";
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
  getIndexSnapshot,
  getDailyTrends,
} from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { parsePeerFilters } from "@/lib/fed-districts";
import {
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  getSpotlightCategories,
  getFeeTier,
  isFeaturedFee,
} from "@/lib/fee-taxonomy";
import { PeerFiltersBar } from "@/components/peer-filters-bar";
import { ReviewQueueHero } from "@/components/review-queue-hero";
import { CrawlStatusStrip } from "@/components/crawl-status-strip";
import { RefreshCacheButton } from "@/components/refresh-cache-button";
import { MapMetricSelector } from "@/components/map-metric-selector";
import {
  HealthTile,
  SummaryKPI,
  CrawlStatusDot,
  ReviewActionDot,
} from "./dashboard-helpers";

const HERO_CATEGORIES = getSpotlightCategories();

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
    asset_tiers: peerFilters.tiers,
    fed_districts: peerFilters.districts,
  };

  const reviewStats = await getReviewStats();
  const stuckItems = await getStuckReviewItems();
  const crawlHealth = await getCrawlHealth();
  const recentReviews = await getRecentReviews(15);

  const peerStats = await getPeerFilteredStats(dbFilters);
  const districtMetrics = await getDistrictMetrics({
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
  });
  const volatileCategories = await getVolatileCategories(dbFilters, 10);
  const riskOutliers = await getRiskOutliers(dbFilters);
  const recentCrawls = await getRecentCrawlActivity(dbFilters, 20);
  const dailyTrends = await getDailyTrends(14);

  const hasFilters =
    peerFilters.charter || peerFilters.tiers || peerFilters.districts;

  const indexSnapshot = await getIndexSnapshot(
    hasFilters ? dbFilters : undefined,
    10
  );

  const nationalStats = hasFilters ? await getPeerFilteredStats({}) : null;

  const heroEntries = HERO_CATEGORIES.map((cat) =>
    indexSnapshot.find((e) => e.fee_category === cat)
  ).filter(Boolean);

  const filterQs = hasFilters
    ? `?${new URLSearchParams(
        Object.entries({
          charter: peerFilters.charter,
          tier: peerFilters.tiers?.join(","),
          district: peerFilters.districts?.map(String).join(","),
        }).filter(([, v]) => v) as [string, string][]
      ).toString()}`
    : "";

  const maxRange = Math.max(
    ...volatileCategories.map((vc) => vc.range_width ?? 0),
    1
  );

  return (
    <>
      {/* Peer Filters */}
      <Suspense fallback={null}>
        <PeerFiltersBar />
      </Suspense>

      {/* ─── OPERATIONAL BAND ─── */}
      <div className="space-y-2.5 mb-8">
        <ReviewQueueHero
          stats={reviewStats}
          stuck={stuckItems}
          isAdmin={user.role === "admin"}
        />
        <div className="flex items-center justify-between gap-3">
          <CrawlStatusStrip health={crawlHealth} />
          {user.role === "admin" && <RefreshCacheButton />}
        </div>
      </div>

      {/* ─── BENCHMARK INDEX ─── */}
      <section className="mb-8">
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            {hasFilters ? "Peer Fee Index" : "National Fee Index"}
          </h2>
          <Link
            href={`/admin/index${filterQs}`}
            className="admin-section-link"
          >
            Full Index &rarr;
          </Link>
        </div>

        {/* Hero KPI Cards */}
        {heroEntries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
            {heroEntries.map((entry) => (
              <Link
                key={entry!.fee_category}
                href={`/admin/fees/catalog/${entry!.fee_category}`}
                className="group admin-card admin-card--interactive kpi-card p-3.5"
              >
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.5 truncate">
                  {getDisplayName(entry!.fee_category)}
                </p>
                <p className="text-xl font-extrabold tabular-nums text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                  {formatAmount(entry!.median_amount)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {entry!.institution_count} inst
                  </span>
                  <span
                    className={`w-[6px] h-[6px] rounded-full ${
                      entry!.maturity_tier === "strong"
                        ? "bg-emerald-500"
                        : entry!.maturity_tier === "provisional"
                          ? "bg-amber-400"
                          : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    title={entry!.maturity_tier}
                    role="img"
                    aria-label={`Maturity: ${entry!.maturity_tier}`}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Index Table */}
        {indexSnapshot.length > 0 && (
          <div className="admin-card overflow-hidden">
            <table className="admin-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>Fee Category</th>
                  <th className="text-right">Median</th>
                  <th className="text-right">P25 &ndash; P75</th>
                  <th className="text-right">Inst.</th>
                  <th className="text-center">Maturity</th>
                </tr>
              </thead>
              <tbody>
                {indexSnapshot.map((entry) => (
                  <tr key={entry.fee_category}>
                    <td>
                      <Link
                        href={`/admin/fees/catalog/${entry.fee_category}`}
                        className="text-gray-900 hover:text-blue-600 font-medium transition-colors"
                      >
                        {getDisplayName(entry.fee_category)}
                      </Link>
                      {!isFeaturedFee(entry.fee_category) && (
                        <span className="ml-1.5 text-[9px] text-gray-300 uppercase">
                          {getFeeTier(entry.fee_category)}
                        </span>
                      )}
                      {entry.fee_family && (
                        <span className="ml-1.5 text-[9px] text-gray-400">
                          {entry.fee_family}
                        </span>
                      )}
                    </td>
                    <td className="text-right font-bold tabular-nums text-gray-900">
                      {formatAmount(entry.median_amount)}
                    </td>
                    <td className="text-right tabular-nums text-gray-400 text-xs">
                      {entry.p25_amount !== null &&
                      entry.p75_amount !== null
                        ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
                        : "-"}
                    </td>
                    <td className="text-right tabular-nums text-gray-600">
                      {entry.institution_count}
                    </td>
                    <td className="text-center">
                      <MaturityBadge tier={entry.maturity_tier} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── HEALTH TILES ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8">
        <HealthTile
          label="Institutions"
          value={peerStats.total_institutions.toLocaleString()}
          global={!hasFilters}
          trend={dailyTrends.map((d) => d.institutions)}
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
          label="Fee URL Coverage"
          value={
            peerStats.total_institutions > 0
              ? `${((peerStats.with_fee_url / peerStats.total_institutions) * 100).toFixed(0)}%`
              : "0%"
          }
          sub={`${peerStats.with_fee_url.toLocaleString()} institutions`}
          highlight
          trend={dailyTrends.map((d) => d.fee_urls)}
          delta={
            hasFilters &&
            nationalStats &&
            nationalStats.total_institutions > 0
              ? ((peerStats.with_fee_url / peerStats.total_institutions) *
                  100) -
                ((nationalStats.with_fee_url /
                  nationalStats.total_institutions) *
                  100)
              : undefined
          }
        />
        <HealthTile
          label="Fees Extracted"
          value={peerStats.total_fees.toLocaleString()}
          href="/admin/fees"
          trend={dailyTrends.map((d) => d.fees_extracted)}
        />
      </div>

      {/* ─── PEER INTELLIGENCE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Districts grid */}
        <div className="lg:col-span-2 admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Fed Districts
            </h2>
            <MapMetricSelector />
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {districtMetrics.map((dm) => {
                const isSelected = peerFilters.districts?.includes(
                  dm.district
                );
                return (
                  <Link
                    key={dm.district}
                    href={`/admin?${new URLSearchParams({
                      ...(peerFilters.charter
                        ? { charter: peerFilters.charter }
                        : {}),
                      ...(peerFilters.tiers
                        ? { tier: peerFilters.tiers.join(",") }
                        : {}),
                      district: String(dm.district),
                    }).toString()}`}
                    className={`rounded-lg border p-2.5 transition-all ${
                      isSelected
                        ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/15 ring-1 ring-blue-200/60 dark:ring-blue-800/40"
                        : "border-gray-100 dark:border-white/[0.04] hover:border-gray-200 dark:hover:border-white/[0.08] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                        {dm.district}
                      </span>
                      <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate ml-1 font-medium">
                        {dm.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-0.5 text-[10px]">
                      <span className="text-gray-400">Inst</span>
                      <span className="text-right font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                        {dm.institution_count}
                      </span>
                      <span className="text-gray-400">URL</span>
                      <span
                        className={`text-right font-bold tabular-nums ${
                          (!params.mapMetric || params.mapMetric === "")
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {(dm.fee_url_pct * 100).toFixed(0)}%
                      </span>
                      <span className="text-gray-400">Fees</span>
                      <span
                        className={`text-right font-bold tabular-nums ${
                          params.mapMetric === "fees"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {dm.total_fees}
                      </span>
                      <span className="text-gray-400">Flag</span>
                      <span
                        className={`text-right font-bold tabular-nums ${
                          params.mapMetric === "flag_rate"
                            ? "text-blue-600 dark:text-blue-400"
                            : dm.flag_rate > 0.25
                              ? "text-red-500"
                              : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {(dm.flag_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Peer Summary */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              {hasFilters ? "Peer Summary" : "National Summary"}
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {peerFilters.districts?.length
                ? `District ${peerFilters.districts.join(", ")}`
                : "All Districts"}
              {peerFilters.charter
                ? ` / ${peerFilters.charter === "bank" ? "Banks" : "CUs"}`
                : ""}
              {peerFilters.tiers
                ? ` / ${peerFilters.tiers.join(", ")}`
                : ""}
            </p>
          </div>
          <div className="p-4 space-y-1">
            <SummaryKPI
              label="Institutions"
              value={peerStats.total_institutions.toLocaleString()}
              delta={
                hasFilters && nationalStats
                  ? peerStats.total_institutions -
                    nationalStats.total_institutions
                  : undefined
              }
              deltaLabel={
                nationalStats
                  ? `of ${nationalStats.total_institutions.toLocaleString()}`
                  : undefined
              }
            />
            <SummaryKPI
              label="Fee URL Coverage"
              value={
                peerStats.total_institutions > 0
                  ? `${((peerStats.with_fee_url / peerStats.total_institutions) * 100).toFixed(1)}%`
                  : "0%"
              }
              delta={
                hasFilters &&
                nationalStats &&
                nationalStats.total_institutions > 0
                  ? ((peerStats.with_fee_url / peerStats.total_institutions) *
                      100) -
                    ((nationalStats.with_fee_url /
                      nationalStats.total_institutions) *
                      100)
                  : undefined
              }
              deltaFormat="pct"
            />
            <SummaryKPI
              label="Fees Extracted"
              value={peerStats.total_fees.toLocaleString()}
            />

            <div className="h-px bg-gray-100 dark:bg-white/[0.04] !my-3" />

            <SummaryKPI
              label="Banks"
              value={peerStats.banks.toLocaleString()}
            />
            <SummaryKPI
              label="Credit Unions"
              value={peerStats.credit_unions.toLocaleString()}
            />

            <div className="pt-3">
              <Link
                href={`/admin/peers${peerFilters.districts?.length ? `?district=${peerFilters.districts[0]}` : ""}`}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
              >
                Explore peer set &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ─── INSIGHTS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        {/* Volatile Categories */}
        <div className="lg:col-span-3 admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Most Volatile Categories
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Ranked by interquartile range
            </p>
          </div>
          {volatileCategories.length > 0 ? (
            <table className="admin-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>Category</th>
                  <th className="text-right">Median</th>
                  <th className="text-right">IQR</th>
                  <th className="w-32">Range</th>
                  <th className="text-right">Outliers</th>
                </tr>
              </thead>
              <tbody>
                {volatileCategories.map((vc) => {
                  const family = getFeeFamily(vc.fee_category);
                  const colors = family ? getFamilyColor(family) : null;
                  const rangeMin = vc.min_amount ?? 0;
                  const rangeMax = vc.max_amount ?? 0;
                  const p25 = vc.p25_amount ?? 0;
                  const p75 = vc.p75_amount ?? 0;
                  const barScale = maxRange > 0 ? 100 / maxRange : 0;
                  const leftPct = rangeMin * barScale;
                  const iqrLeftPct = p25 * barScale;
                  const iqrWidthPct = (p75 - p25) * barScale;
                  const rightPct = rangeMax * barScale;
                  const outlierCount = vc.flagged_count;
                  return (
                    <tr key={vc.fee_category}>
                      <td>
                        <Link
                          href={`/admin/fees/catalog/${vc.fee_category}`}
                          className="text-gray-900 hover:text-blue-600 font-medium text-xs transition-colors"
                        >
                          {getDisplayName(vc.fee_category)}
                        </Link>
                        {family && colors && (
                          <span
                            className={`ml-1.5 inline-block rounded px-1 py-0.5 text-[8px] font-bold ${colors.bg} ${colors.text}`}
                          >
                            {family}
                          </span>
                        )}
                        {!isFeaturedFee(vc.fee_category) && (
                          <span className="ml-1 text-[8px] text-gray-300 uppercase">
                            {getFeeTier(vc.fee_category)}
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums text-gray-900 font-bold text-xs">
                        {formatAmount(vc.median_amount)}
                      </td>
                      <td className="text-right tabular-nums font-bold text-gray-900 text-xs">
                        {formatAmount(vc.iqr)}
                      </td>
                      <td>
                        <div
                          className="relative h-3 w-full"
                          role="img"
                          aria-label={`Range ${formatAmount(rangeMin)} to ${formatAmount(rangeMax)}`}
                        >
                          <div
                            className="absolute top-1/2 h-px bg-gray-200 dark:bg-gray-700"
                            style={{
                              left: `${Math.min(leftPct, 100)}%`,
                              width: `${Math.min(rightPct - leftPct, 100)}%`,
                            }}
                          />
                          <div
                            className="absolute top-[3px] h-[6px] rounded-sm bg-blue-400/50 dark:bg-blue-500/30"
                            style={{
                              left: `${Math.min(iqrLeftPct, 100)}%`,
                              width: `${Math.min(iqrWidthPct, 100)}%`,
                            }}
                          />
                          {vc.median_amount !== null && (
                            <div
                              className="absolute top-[2px] w-[2px] h-[8px] rounded-full bg-gray-800 dark:bg-gray-200"
                              style={{
                                left: `${Math.min((vc.median_amount ?? 0) * barScale, 100)}%`,
                              }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        {outlierCount > 0 ? (
                          <span className="tabular-nums text-[11px] font-bold text-orange-600 dark:text-orange-400">
                            {outlierCount}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">
                            &mdash;
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-xs text-gray-400 text-center">
              No fee data available
            </div>
          )}
        </div>

        {/* Risk & Outliers */}
        <div className="lg:col-span-2 admin-card overflow-hidden border-red-100/60 dark:!border-red-900/20">
          <div className="px-4 py-2.5 border-b border-red-100/60 dark:border-red-900/20 bg-red-50/30 dark:bg-red-900/5">
            <div className="flex items-center gap-2">
              <span className="w-[6px] h-[6px] rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.12)]" />
              <h2 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em]">
                Risk &amp; Outliers
              </h2>
            </div>
          </div>
          <div className="p-3.5 space-y-4">
            {riskOutliers.top_flagged_categories.length > 0 && (
              <RiskSection label="Top Flagged Categories">
                {riskOutliers.top_flagged_categories.map((fc) => {
                  const flagRate =
                    fc.total_count > 0
                      ? fc.flagged_count / fc.total_count
                      : 0;
                  return (
                    <Link
                      key={fc.fee_category}
                      href="/admin/review?status=flagged"
                      className="flex items-center justify-between rounded px-2 py-1 -mx-2 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {getDisplayName(fc.fee_category)}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              flagRate > 0.25
                                ? "bg-red-500"
                                : "bg-orange-400"
                            }`}
                            style={{
                              width: `${Math.min(flagRate * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-[11px] font-bold tabular-nums ${
                            flagRate > 0.25
                              ? "text-red-600 dark:text-red-400"
                              : "text-orange-600 dark:text-orange-400"
                          }`}
                        >
                          {fc.flagged_count}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          /{fc.total_count}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </RiskSection>
            )}

            {riskOutliers.repeated_failures.length > 0 && (
              <RiskSection label="Repeated Failures">
                {riskOutliers.repeated_failures.slice(0, 5).map((rf) => (
                  <Link
                    key={rf.id}
                    href={`/admin/peers/${rf.id}`}
                    className="flex items-center justify-between rounded px-2 py-1 -mx-2 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[180px]">
                      {rf.institution_name}
                    </span>
                    <span className="text-[11px] font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                      {rf.consecutive_failures}x
                    </span>
                  </Link>
                ))}
              </RiskSection>
            )}

            {riskOutliers.extreme_outlier_fees.length > 0 && (
              <RiskSection label="Extreme Outliers">
                {riskOutliers.extreme_outlier_fees.map((of) => (
                  <Link
                    key={of.id}
                    href={`/admin/review/${of.id}`}
                    className="flex items-center justify-between rounded px-2 py-1 -mx-2 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {getDisplayName(of.fee_category ?? of.fee_name)}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-1 truncate">
                        {of.institution_name}
                      </span>
                    </div>
                    <span className="tabular-nums text-sm font-extrabold text-red-600 dark:text-red-400 shrink-0 ml-2">
                      {formatAmount(of.amount)}
                    </span>
                  </Link>
                ))}
              </RiskSection>
            )}

            {indexSnapshot.length > 0 && (
              <div className="pt-2 border-t border-red-100/40 dark:border-red-900/15">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    Insufficient maturity
                  </span>
                  <span className="font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                    {
                      indexSnapshot.filter(
                        (e) => e.maturity_tier === "insufficient"
                      ).length
                    }
                  </span>
                </div>
              </div>
            )}

            {riskOutliers.top_flagged_categories.length === 0 &&
              riskOutliers.repeated_failures.length === 0 &&
              riskOutliers.extreme_outlier_fees.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">
                  No risk items
                </p>
              )}
          </div>
        </div>
      </div>

      {/* ─── ACTIVITY FEEDS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Crawls */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Recent Crawls
            </h2>
            <span className="text-[10px] text-gray-300 dark:text-gray-600">
              {hasFilters ? "Filtered" : "All"}
            </span>
          </div>
          {recentCrawls.length > 0 ? (
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Institution</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {recentCrawls.slice(0, 10).map((rc, i) => (
                  <tr key={`${rc.crawl_target_id}-${i}`}>
                    <td>
                      <Link
                        href={`/admin/peers/${rc.crawl_target_id}`}
                        className="text-gray-700 dark:text-gray-300 hover:text-blue-600 font-medium transition-colors"
                      >
                        {rc.institution_name}
                      </Link>
                    </td>
                    <td className="text-center">
                      <CrawlStatusDot status={rc.status} />
                    </td>
                    <td className="text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {rc.fees_extracted}
                    </td>
                    <td className="text-right text-gray-400 dark:text-gray-500 tabular-nums">
                      {rc.crawled_at ? new Date(rc.crawled_at).toISOString().slice(0, 10) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">
              No recent crawls
            </div>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Recent Reviews
            </h2>
            <span className="text-[10px] text-gray-300 dark:text-gray-600">
              Global
            </span>
          </div>
          {recentReviews.length > 0 ? (
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
                {recentReviews.map((rr, i) => (
                  <tr key={`${rr.fee_id}-${i}`}>
                    <td className="text-gray-600 dark:text-gray-400">
                      {rr.username ?? "system"}
                    </td>
                    <td>
                      <ReviewActionDot action={rr.action} />
                    </td>
                    <td>
                      <Link
                        href={`/admin/review/${rr.fee_id}`}
                        className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors"
                      >
                        {rr.fee_category
                          ? getDisplayName(rr.fee_category)
                          : rr.fee_name}
                      </Link>
                      <span className="text-gray-400 ml-1 hidden sm:inline">
                        {rr.institution_name}
                      </span>
                    </td>
                    <td className="text-right text-gray-400 dark:text-gray-500 tabular-nums">
                      {rr.created_at ? new Date(rr.created_at).toISOString().slice(0, 10) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">
              No recent reviews
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MaturityBadge({ tier }: { tier: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    strong: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      label: "Strong",
    },
    provisional: {
      bg: "bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      label: "Provisional",
    },
    insufficient: {
      bg: "bg-gray-500/10",
      text: "text-gray-400",
      label: "Low",
    },
  };
  const { bg, text, label } = config[tier] ?? config.insufficient;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

function RiskSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[9px] font-extrabold text-red-400/80 dark:text-red-500/60 uppercase tracking-[0.1em] mb-1.5">
        {label}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

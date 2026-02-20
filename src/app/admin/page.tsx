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
import { generateAllInsights } from "@/lib/insight-engine";
import { PeerFiltersBar } from "@/components/peer-filters-bar";
import { MorningBriefing } from "@/components/morning-briefing";
import { ActionCardStrip } from "@/components/action-cards";
import { BenchmarkCard } from "@/components/benchmark-card";
import { DistrictNarrative } from "@/components/district-narrative";
import { OperationalPanel } from "@/components/operational-panel";
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

  // Global queries (not affected by peer filters)
  const reviewStats = getReviewStats();
  const stuckItems = getStuckReviewItems();
  const crawlHealth = getCrawlHealth();
  const recentReviews = getRecentReviews(15);

  // Peer-filtered queries
  const peerStats = getPeerFilteredStats(dbFilters);
  const districtMetrics = getDistrictMetrics({
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
  });
  const volatileCategories = getVolatileCategories(dbFilters, 10);
  const riskOutliers = getRiskOutliers(dbFilters);
  const recentCrawls = getRecentCrawlActivity(dbFilters, 20);
  const dailyTrends = getDailyTrends(14);

  const hasFilters =
    peerFilters.charter || peerFilters.tiers || peerFilters.districts;

  // Index snapshot (respects peer filters)
  const indexSnapshot = getIndexSnapshot(
    hasFilters ? dbFilters : undefined,
    10
  );

  // National stats for comparison deltas (only when peer filters active)
  const nationalStats = hasFilters ? getPeerFilteredStats({}) : null;

  // Extract hero entries from the index
  const heroEntries = HERO_CATEGORIES.map((cat) =>
    indexSnapshot.find((e) => e.fee_category === cat)
  ).filter(Boolean);

  // Build filter-forwarding query string
  const filterQs = hasFilters
    ? `?${new URLSearchParams(
        Object.entries({
          charter: peerFilters.charter,
          tier: peerFilters.tiers?.join(","),
          district: peerFilters.districts?.map(String).join(","),
        }).filter(([, v]) => v) as [string, string][]
      ).toString()}`
    : "";

  // IQR bar normalization
  const maxRange = Math.max(
    ...volatileCategories.map((vc) => vc.range_width ?? 0),
    1
  );

  // Generate insights from all data
  const insights = generateAllInsights({
    reviewStats,
    stuckItems,
    crawlHealth,
    dailyTrends,
    peerStats,
    nationalStats,
    indexSnapshot,
    volatileCategories,
    riskOutliers,
  });

  // Map volatile categories by fee_category for benchmark card context
  const volatileMap = new Map(
    volatileCategories.map((vc) => [vc.fee_category, vc])
  );

  return (
    <>
      {/* Peer Filters Bar */}
      <Suspense fallback={null}>
        <PeerFiltersBar />
      </Suspense>

      {/* ─── MORNING BRIEFING ─── */}
      <div className="mb-6">
        <MorningBriefing
          insights={insights}
          reviewStats={reviewStats}
          crawlHealth={crawlHealth}
          userName={user.username}
        />
      </div>

      {/* ─── ACTION CARDS ─── */}
      {insights.some((i) => i.action) && (
        <div className="mb-8">
          <ActionCardStrip insights={insights} />
        </div>
      )}

      {/* ─── BENCHMARK AUTHORITY ─── */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {hasFilters ? "Peer Fee Index" : "National Bank Fee Index"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Validated median benchmarks across {indexSnapshot.length}{" "}
              categories
            </p>
          </div>
          <Link
            href={`/admin/index${filterQs}`}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View Full Index &rarr;
          </Link>
        </div>

        {/* Hero Benchmark Cards — with context */}
        {heroEntries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {heroEntries.map((entry) => (
              <BenchmarkCard
                key={entry!.fee_category}
                entry={entry!}
                volatileEntry={volatileMap.get(entry!.fee_category)}
                href={`/admin/fees/catalog/${entry!.fee_category}`}
              />
            ))}
          </div>
        )}

        {/* Index Table with context column */}
        {indexSnapshot.length > 0 && (
          <div className="admin-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03] text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Fee Category
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                      Median
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                      P25 &ndash; P75
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                      Inst.
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                      Maturity
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Context
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {indexSnapshot.map((entry) => {
                    const vc = volatileMap.get(entry.fee_category);
                    const isHighDispersion =
                      vc?.iqr !== null &&
                      vc?.iqr !== undefined &&
                      entry.median_amount !== null &&
                      entry.median_amount > 0 &&
                      vc.iqr > entry.median_amount * 0.3;

                    return (
                      <tr
                        key={entry.fee_category}
                        className="border-b last:border-0 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/fees/catalog/${entry.fee_category}`}
                            className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                          >
                            {getDisplayName(entry.fee_category)}
                          </Link>
                          {!isFeaturedFee(entry.fee_category) && (
                            <span className="ml-1.5 text-[9px] text-gray-300 dark:text-gray-600 uppercase">
                              {getFeeTier(entry.fee_category)}
                            </span>
                          )}
                          {entry.fee_family && (
                            <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500">
                              {entry.fee_family}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatAmount(entry.median_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 dark:text-gray-500 text-xs">
                          {entry.p25_amount !== null &&
                          entry.p75_amount !== null
                            ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                          {entry.institution_count}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.maturity_tier === "strong"
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : entry.maturity_tier === "provisional"
                                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                                  : "bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500"
                            }`}
                            title={`${entry.approved_count} approved of ${entry.observation_count} total`}
                          >
                            {entry.maturity_tier === "strong"
                              ? "Strong"
                              : entry.maturity_tier === "provisional"
                                ? "Provisional"
                                : "Insufficient"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {entry.maturity_tier === "strong" &&
                            entry.institution_count >= 20
                              ? "Reliable benchmark"
                              : entry.maturity_tier === "insufficient"
                                ? "Needs more data"
                                : isHighDispersion
                                  ? "Wide price spread"
                                  : entry.institution_count >= 15
                                    ? "Good coverage"
                                    : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ─── HEALTH TILES ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
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
            hasFilters && nationalStats && nationalStats.total_institutions > 0
              ? ((peerStats.with_fee_url / peerStats.total_institutions) *
                  100 -
                  (nationalStats.with_fee_url /
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

      {/* ─── GEOGRAPHIC & PEER INTELLIGENCE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Fed District Grid */}
        <div className="lg:col-span-2 admin-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Fed Districts
            </h2>
            <MapMetricSelector />
          </div>
          <div className="p-4">
            <DistrictNarrative metrics={districtMetrics} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
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
                    className={`rounded-lg border p-2.5 text-sm transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800 shadow-sm"
                        : "hover:border-gray-300 dark:hover:border-white/15 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {dm.district}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate ml-1">
                        {dm.name}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-0.5 text-[11px]">
                      <div>
                        <span className="text-gray-400 dark:text-gray-500">
                          Inst
                        </span>{" "}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {dm.institution_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 dark:text-gray-500">
                          URL
                        </span>{" "}
                        <span
                          className={`font-semibold ${
                            !params.mapMetric || params.mapMetric === ""
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {(dm.fee_url_pct * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 dark:text-gray-500">
                          Fees
                        </span>{" "}
                        <span
                          className={`font-semibold ${
                            params.mapMetric === "fees"
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {dm.total_fees}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 dark:text-gray-500">
                          Flag
                        </span>{" "}
                        <span
                          className={`font-semibold ${
                            params.mapMetric === "flag_rate"
                              ? "text-blue-600 dark:text-blue-400"
                              : dm.flag_rate > 0.25
                                ? "text-red-500 dark:text-red-400"
                                : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {(dm.flag_rate * 100).toFixed(0)}%
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
        <div className="admin-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {hasFilters ? "Peer Summary" : "National Summary"}
            </h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {peerFilters.districts?.length
                ? `District ${peerFilters.districts.join(", ")}`
                : "All Districts"}
              {peerFilters.charter
                ? ` / ${peerFilters.charter === "bank" ? "Banks" : "Credit Unions"}`
                : ""}
              {peerFilters.tiers ? ` / ${peerFilters.tiers.join(", ")}` : ""}
            </p>
          </div>
          <div className="p-5 space-y-3">
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
                      100 -
                      (nationalStats.with_fee_url /
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

            <div className="h-px bg-gray-100 dark:bg-white/[0.06]" />

            <SummaryKPI
              label="Banks"
              value={peerStats.banks.toLocaleString()}
            />
            <SummaryKPI
              label="Credit Unions"
              value={peerStats.credit_unions.toLocaleString()}
            />

            <div className="pt-2">
              <Link
                href={`/admin/peers${peerFilters.districts?.length ? `?district=${peerFilters.districts[0]}` : ""}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Explore peer set &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ─── ATTENTION REQUIRED: Volatile Categories + Risk ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-10">
        {/* Volatile fee categories */}
        <div className="lg:col-span-3 admin-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Most Volatile Fee Categories
            </h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Ranked by interquartile range (IQR)
            </p>
          </div>
          {volatileCategories.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                      Median
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                      IQR
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-40">
                      Range
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                      Outliers
                    </th>
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
                      <tr
                        key={vc.fee_category}
                        className="border-b last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/fees/catalog/${vc.fee_category}`}
                            className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 font-medium text-xs transition-colors"
                          >
                            {getDisplayName(vc.fee_category)}
                          </Link>
                          {family && colors && (
                            <span
                              className={`ml-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-semibold ${colors.bg} ${colors.text}`}
                            >
                              {family}
                            </span>
                          )}
                          {!isFeaturedFee(vc.fee_category) && (
                            <span className="ml-1 text-[9px] text-gray-300 dark:text-gray-600 uppercase">
                              {getFeeTier(vc.fee_category)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100 font-medium">
                          {formatAmount(vc.median_amount)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                          {formatAmount(vc.iqr)}
                        </td>
                        <td className="px-4 py-2">
                          <div
                            className="relative h-4 w-full"
                            role="img"
                            aria-label={`Range ${formatAmount(rangeMin)} to ${formatAmount(rangeMax)}, IQR ${formatAmount(p25)} to ${formatAmount(p75)}, median ${formatAmount(vc.median_amount)}`}
                          >
                            <div
                              className="absolute top-1/2 h-px bg-gray-200 dark:bg-gray-700"
                              style={{
                                left: `${Math.min(leftPct, 100)}%`,
                                width: `${Math.min(rightPct - leftPct, 100)}%`,
                              }}
                            />
                            <div
                              className="absolute top-1 h-2 rounded-sm bg-blue-400/60 dark:bg-blue-500/50"
                              style={{
                                left: `${Math.min(iqrLeftPct, 100)}%`,
                                width: `${Math.min(iqrWidthPct, 100)}%`,
                              }}
                            />
                            {vc.median_amount !== null && (
                              <div
                                className="absolute top-0.5 w-1 h-3 rounded-full bg-gray-800 dark:bg-gray-200"
                                style={{
                                  left: `${Math.min((vc.median_amount ?? 0) * barScale, 100)}%`,
                                }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {outlierCount > 0 ? (
                            <span className="tabular-nums text-xs font-semibold text-orange-600 dark:text-orange-400">
                              {outlierCount}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-sm text-gray-400 dark:text-gray-500 text-center">
              No fee data available for current filters
            </div>
          )}
        </div>

        {/* Needs Your Attention */}
        <div className="lg:col-span-2 admin-card !border-red-100 dark:!border-red-900/30">
          <div className="px-5 py-3 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                Needs Your Attention
              </h2>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Items requiring review or investigation
            </p>
          </div>
          <div className="p-4 space-y-5">
            {riskOutliers.top_flagged_categories.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-wider mb-2">
                  Top Flagged Categories
                </h3>
                <div className="space-y-1">
                  {riskOutliers.top_flagged_categories.map((fc) => {
                    const flagRate =
                      fc.total_count > 0
                        ? fc.flagged_count / fc.total_count
                        : 0;
                    return (
                      <Link
                        key={fc.fee_category}
                        href="/admin/review?status=flagged"
                        className="flex items-center justify-between text-sm hover:bg-red-50/50 dark:hover:bg-red-900/10 rounded px-2 py-1.5 -mx-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">
                            {getDisplayName(fc.fee_category)}
                          </span>
                          {flagRate > 0.2 && (
                            <span className="block text-[10px] text-red-500 dark:text-red-400 mt-0.5">
                              {(flagRate * 100).toFixed(0)}% flag rate
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
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
                            className={`text-xs font-semibold tabular-nums ${
                              flagRate > 0.25
                                ? "text-red-600 dark:text-red-400"
                                : "text-orange-600 dark:text-orange-400"
                            }`}
                          >
                            {fc.flagged_count}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            /{fc.total_count}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {riskOutliers.repeated_failures.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-wider mb-2">
                  Repeated Crawl Failures
                </h3>
                <div className="space-y-1">
                  {riskOutliers.repeated_failures.slice(0, 5).map((rf) => (
                    <Link
                      key={rf.id}
                      href={`/admin/peers/${rf.id}`}
                      className="flex items-center justify-between text-sm hover:bg-red-50/50 dark:hover:bg-red-900/10 rounded px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-[180px] text-xs">
                        {rf.institution_name}
                      </span>
                      <span className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {rf.consecutive_failures}x
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {riskOutliers.extreme_outlier_fees.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-wider mb-2">
                  Extreme Outlier Fees
                </h3>
                <div className="space-y-1">
                  {riskOutliers.extreme_outlier_fees.map((of) => (
                    <Link
                      key={of.id}
                      href={`/admin/review/${of.id}`}
                      className="flex items-center justify-between text-sm hover:bg-red-50/50 dark:hover:bg-red-900/10 rounded px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">
                          {getDisplayName(of.fee_category ?? of.fee_name)}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 truncate">
                          {of.institution_name}
                        </span>
                      </div>
                      <span className="tabular-nums text-sm font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">
                        {formatAmount(of.amount)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {indexSnapshot.length > 0 && (
              <div className="pt-3 border-t border-red-100 dark:border-red-900/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    Insufficient maturity categories
                  </span>
                  <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">
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
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  No items requiring attention
                </p>
              )}
          </div>
        </div>
      </div>

      {/* ─── OPERATIONAL TABLES (collapsed by default) ─── */}
      <OperationalPanel
        crawlCount={recentCrawls.length}
        reviewCount={recentReviews.length}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-white/[0.06]">
          {/* Recently Crawled */}
          <div>
            <div className="px-4 py-2.5 border-b bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Recent Crawls
              </h2>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {hasFilters ? "Filtered" : "All institutions"}
              </span>
            </div>
            {recentCrawls.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-400 dark:text-gray-500">
                      <th className="px-3 py-2 font-medium">Institution</th>
                      <th className="px-3 py-2 font-medium text-center">
                        Status
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Fees
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCrawls.slice(0, 10).map((rc, i) => (
                      <tr
                        key={`${rc.crawl_target_id}-${i}`}
                        className="border-b last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-3 py-1.5">
                          <Link
                            href={`/admin/peers/${rc.crawl_target_id}`}
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                          >
                            {rc.institution_name}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <CrawlStatusDot status={rc.status} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                          {rc.fees_extracted}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-400 dark:text-gray-500">
                          {rc.crawled_at?.slice(0, 10) ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-xs text-gray-400 dark:text-gray-500 text-center">
                No recent crawl activity
              </div>
            )}
          </div>

          {/* Recent Reviews */}
          <div>
            <div className="px-4 py-2.5 border-b bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Recent Reviews
              </h2>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Global
              </span>
            </div>
            {recentReviews.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-400 dark:text-gray-500">
                      <th className="px-3 py-2 font-medium">Reviewer</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Fee</th>
                      <th className="px-3 py-2 font-medium text-right">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReviews.map((rr, i) => (
                      <tr
                        key={`${rr.fee_id}-${i}`}
                        className="border-b last:border-0 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                          {rr.username ?? "system"}
                        </td>
                        <td className="px-3 py-1.5">
                          <ReviewActionDot action={rr.action} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Link
                            href={`/admin/review/${rr.fee_id}`}
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {rr.fee_category
                              ? getDisplayName(rr.fee_category)
                              : rr.fee_name}
                          </Link>
                          <span className="text-gray-400 dark:text-gray-500 ml-1">
                            {rr.institution_name}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-400 dark:text-gray-500">
                          {rr.created_at?.slice(0, 10) ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-xs text-gray-400 dark:text-gray-500 text-center">
                No recent review activity
              </div>
            )}
          </div>
        </div>
      </OperationalPanel>
    </>
  );
}

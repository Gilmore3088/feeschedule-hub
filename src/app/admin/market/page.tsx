import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getNationalIndex,
  getPeerIndex,
  getTierCounts,
  getFilteredTierCounts,
  getDistrictMetrics,
  getPeerPreviewStats,
  getSavedPeerSets,
  getSegmentOutliers,
  getFeesForCategory,
  getBeigeBookHeadlines,
  buildMarketIndex,
  type MarketIndexEntry,
  type SegmentOutlier,
} from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parsePeerFilters, buildFilterDescription } from "@/lib/fed-districts";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { SavedSegments } from "@/components/saved-segments";

import { SegmentControlBar } from "./segment-control-bar";
import { HeroBenchmarkCards } from "./hero-cards";
import { CategoryExplorer } from "./category-explorer";
import { DistributionPanel } from "./distribution-panel";
import { DistrictMapPanel } from "./district-map-panel";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    tier?: string;
    district?: string;
    cat?: string;
    mapMetric?: string;
    approved?: string;
  }>;
}) {
  const user = await requireAuth("view");
  const params = await searchParams;

  const peerFilters = parsePeerFilters(params);
  const approvedOnly = params.approved === "1";
  const selectedCategory = params.cat ?? null;
  const mapMetric = params.mapMetric ?? "";

  const dbFilters = {
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
    fed_districts: peerFilters.districts,
  };

  const hasFilters = !!(
    peerFilters.charter ||
    peerFilters.tiers ||
    peerFilters.districts
  );

  // Data fetching (all synchronous better-sqlite3)
  const nationalIndex = getNationalIndex(approvedOnly);
  const segmentIndex = hasFilters
    ? getPeerIndex(dbFilters, approvedOnly)
    : null;
  const entries = buildMarketIndex(nationalIndex, segmentIndex);

  const segmentStats = getPeerPreviewStats(dbFilters);
  const nationalStats = hasFilters ? getPeerPreviewStats({}) : null;

  const tierCounts = getTierCounts();
  const filteredTierCounts = hasFilters
    ? getFilteredTierCounts(dbFilters)
    : null;

  const districtMetrics = getDistrictMetrics(dbFilters);
  const beigeBookMap = getBeigeBookHeadlines();
  const beigeBookHeadlines: Record<
    string,
    { text: string; release_date: string }
  > = {};
  for (const [k, v] of beigeBookMap) {
    beigeBookHeadlines[String(k)] = v;
  }

  const outliers = getSegmentOutliers(dbFilters, 3);
  const savedSets = getSavedPeerSets(user.username);

  // Distribution data (only when a category is selected)
  const segmentFees = selectedCategory
    ? getFeesForCategory(selectedCategory, dbFilters, approvedOnly)
    : [];
  const nationalFees = selectedCategory
    ? getFeesForCategory(selectedCategory, {}, approvedOnly)
    : [];

  const selectedEntry = selectedCategory
    ? entries.find((e) => e.fee_category === selectedCategory)
    : null;

  const filterDescription = hasFilters
    ? buildFilterDescription(peerFilters)
    : "All U.S. Financial Institutions";

  // Tier breakdown data for right panel
  const tierBreakdown = filteredTierCounts ?? tierCounts;
  const totalTierCount = tierBreakdown.reduce((s, t) => s + t.count, 0);

  // Highest and lowest outliers
  const highestOutliers = outliers.filter((o) => o.type === "highest");
  const lowestOutliers = outliers.filter((o) => o.type === "lowest");

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Market Index" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Market Index Explorer
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Build and analyze retail banking fee benchmarks across segments
        </p>
      </div>

      {/* Segment control bar */}
      <Suspense fallback={null}>
        <SegmentControlBar
          tierCounts={tierCounts}
          selectedTiers={peerFilters.tiers ?? []}
          selectedCharter={peerFilters.charter ?? ""}
          selectedDistricts={peerFilters.districts ?? []}
          hasFilters={hasFilters}
          institutionCount={segmentStats.total_institutions}
          nationalCount={
            nationalStats?.total_institutions ??
            segmentStats.total_institutions
          }
          filterDescription={filterDescription}
        />
      </Suspense>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left panel: benchmark engine */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero benchmark cards */}
          <HeroBenchmarkCards entries={entries} hasFilters={hasFilters} />

          {/* Category explorer */}
          <Suspense fallback={null}>
            <CategoryExplorer
              entries={entries}
              selectedCategory={selectedCategory}
              hasFilters={hasFilters}
            />
          </Suspense>

          {/* Distribution panel (conditional) */}
          {selectedCategory && (
            <DistributionPanel
              category={selectedCategory}
              segmentFees={segmentFees}
              nationalFees={nationalFees}
              segmentMedian={selectedEntry?.median_amount ?? null}
              nationalMedian={selectedEntry?.national_median ?? null}
            />
          )}
        </div>

        {/* Right panel: segment intelligence */}
        <div className="lg:col-span-4 space-y-4 order-first lg:order-last">
          {/* District map */}
          <Suspense fallback={null}>
            <DistrictMapPanel
              districtMetrics={districtMetrics}
              selectedDistricts={peerFilters.districts ?? []}
              mapMetric={mapMetric}
              selectedCategory={selectedCategory}
              beigeBookHeadlines={beigeBookHeadlines}
            />
          </Suspense>

          {/* Segment stats card */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <h3 className="text-sm font-bold text-gray-800">
                Segment Summary
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <StatRow
                label="Institutions"
                value={segmentStats.total_institutions.toLocaleString()}
                sub={
                  hasFilters && nationalStats
                    ? `${((segmentStats.total_institutions / nationalStats.total_institutions) * 100).toFixed(1)}% of national`
                    : undefined
                }
              />
              <StatRow
                label="Fee URL Coverage"
                value={
                  segmentStats.total_institutions > 0
                    ? `${((segmentStats.with_fee_url / segmentStats.total_institutions) * 100).toFixed(1)}%`
                    : "0%"
                }
                sub={`${segmentStats.with_fee_url.toLocaleString()} of ${segmentStats.total_institutions.toLocaleString()}`}
              />
              <StatRow
                label="Total Fees"
                value={segmentStats.total_fees.toLocaleString()}
              />
              <StatRow
                label="Avg Confidence"
                value={`${(segmentStats.avg_confidence * 100).toFixed(1)}%`}
              />
              <StatRow
                label="Flag Rate"
                value={`${(segmentStats.flag_rate * 100).toFixed(1)}%`}
                highlight={segmentStats.flag_rate > 0.15}
              />
            </div>
          </div>

          {/* Tier breakdown card */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <h3 className="text-sm font-bold text-gray-800">
                Tier Breakdown
              </h3>
            </div>
            <div className="p-4 space-y-2.5">
              {tierBreakdown.map((t) => {
                const pct =
                  totalTierCount > 0
                    ? (t.count / totalTierCount) * 100
                    : 0;
                return (
                  <div key={t.tier} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 truncate">
                      {t.tier.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums w-12 text-right">
                      {t.count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              {tierBreakdown.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">
                  No tier data available
                </p>
              )}
            </div>
          </div>

          {/* Top outliers card */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <h3 className="text-sm font-bold text-gray-800">
                Top Outliers
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {highestOutliers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Highest Fees
                  </p>
                  <div className="space-y-1.5">
                    {highestOutliers.map((o, i) => (
                      <OutlierRow key={`h-${i}`} outlier={o} />
                    ))}
                  </div>
                </div>
              )}
              {lowestOutliers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Lowest Fees
                  </p>
                  <div className="space-y-1.5">
                    {lowestOutliers.map((o, i) => (
                      <OutlierRow key={`l-${i}`} outlier={o} />
                    ))}
                  </div>
                </div>
              )}
              {outliers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">
                  No outlier data available
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved segments */}
      <div className="mt-6">
        <Suspense fallback={null}>
          <SavedSegments
            segments={savedSets}
            hasFilters={hasFilters}
            currentFilters={{
              charter: peerFilters.charter,
              tiers: peerFilters.tiers,
              districts: peerFilters.districts,
            }}
            basePath="/admin/market"
          />
        </Suspense>
      </div>
    </>
  );
}

function StatRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </span>
      <div className="text-right">
        <span
          className={`text-sm font-bold tabular-nums ${
            highlight ? "text-amber-600" : "text-gray-900"
          }`}
        >
          {value}
        </span>
        {sub && (
          <p className="text-[10px] text-gray-400 tabular-nums">{sub}</p>
        )}
      </div>
    </div>
  );
}

function OutlierRow({ outlier }: { outlier: SegmentOutlier }) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-xs text-gray-700 truncate">
          {getDisplayName(outlier.fee_category)}
        </p>
        <Link
          href={`/admin/peers/${outlier.institution_id}`}
          className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors truncate block"
        >
          {outlier.institution_name}
        </Link>
      </div>
      <span className="text-sm font-bold tabular-nums text-gray-900 ml-3 flex-shrink-0">
        {formatAmount(outlier.amount)}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getTierCounts,
  getDistrictMetrics,
  getPeerPreviewStats,
  getTopCategoriesForPeerSet,
  getSavedPeerSets,
  getBeigeBookHeadlines,
  getLatestBeigeBook,
} from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parsePeerFilters, buildFilterDescription } from "@/lib/fed-districts";
import { PeerFilterPanel } from "@/components/peer-filter-panel";
import { PeerPreviewPanel } from "@/components/peer-preview-panel";
import { DistrictMapSelect } from "@/components/district-map-select";
import { SavedSegments } from "@/components/saved-segments";

export default async function PeersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    tier?: string;
    district?: string;
  }>;
}) {
  const user = await requireAuth("view");
  const params = await searchParams;

  const peerFilters = parsePeerFilters({
    charter: params.type,
    tier: params.tier,
    district: params.district,
  });

  const hasFilters = !!(peerFilters.charter || peerFilters.tiers || peerFilters.districts);

  const dbFilters = {
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
    fed_districts: peerFilters.districts,
  };

  const tierCounts = await getTierCounts();
  const districtStats = await getDistrictMetrics({
    charter_type: peerFilters.charter,
    asset_tiers: peerFilters.tiers,
  });
  const savedSets = await getSavedPeerSets(user.username);

  const previewStats = await getPeerPreviewStats(dbFilters);
  const topCategories = hasFilters
    ? await getTopCategoriesForPeerSet(dbFilters, 5)
    : [];

  const beigeBookHeadlines = await getBeigeBookHeadlines();
  const singleDistrict =
    peerFilters.districts?.length === 1 ? peerFilters.districts[0] : null;
  const beigeBookSections = singleDistrict
    ? await getLatestBeigeBook(singleDistrict)
    : [];

  const filterDescription = buildFilterDescription(peerFilters);

  const filterCount =
    ((peerFilters.tiers?.length ?? 0) > 0 ? 1 : 0) +
    ((peerFilters.districts?.length ?? 0) > 0 ? 1 : 0) +
    (peerFilters.charter ? 1 : 0);

  const exploreParams = new URLSearchParams();
  if (peerFilters.tiers) exploreParams.set("tier", peerFilters.tiers.join(","));
  if (peerFilters.districts) exploreParams.set("district", peerFilters.districts.join(","));
  if (peerFilters.charter) exploreParams.set("type", peerFilters.charter);
  const exploreQs = exploreParams.toString();
  const exploreHref = exploreQs
    ? `/admin/peers/explore?${exploreQs}`
    : "/admin/peers/explore";

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Peer Index" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Peer Index Explorer</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Build and explore market segments
        </p>
      </div>

      <Suspense fallback={null}>
        <SavedSegments
          segments={savedSets}
          hasFilters={hasFilters}
          currentFilters={peerFilters}
          basePath="/admin/peers"
        />
      </Suspense>

      <div className="space-y-6">
        {/* Combined: Filters + Segment Preview */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-gray-800">
                Segment Builder
              </h2>
              <span className="text-[11px] text-gray-400 tabular-nums">
                {previewStats.total_institutions.toLocaleString()} institutions
              </span>
              {filterCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-[10px] font-medium">
                  {filterCount} filter{filterCount !== 1 ? "s" : ""} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {filterCount > 0 && (
                <Link
                  href="/admin/peers"
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Reset All
                </Link>
              )}
              {hasFilters && (
                <Link
                  href={exploreHref}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
                >
                  Explore peers
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5">
            <PeerFilterPanel
              tierCounts={tierCounts}
              selectedTiers={peerFilters.tiers ?? []}
              selectedCharter={peerFilters.charter ?? ""}
              basePath="/admin/peers"
            />

            <div className="border-t pt-5">
              <PeerPreviewPanel
                hasFilters={hasFilters}
                stats={previewStats}
                topCategories={topCategories}
                filterDescription={filterDescription}
                exploreHref={exploreHref}
                singleDistrict={singleDistrict}
                beigeBookSections={beigeBookSections}
                multipleDistricts={(peerFilters.districts?.length ?? 0) > 1}
              />
            </div>
          </div>
        </div>

        {/* Full-width district map */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50/80">
            <h2 className="text-sm font-bold text-gray-800">
              Federal Reserve Districts
            </h2>
          </div>
          <div className="p-5">
            <DistrictMapSelect
              districtStats={districtStats}
              selected={peerFilters.districts ?? []}
              basePath="/admin/peers"
              beigeBookHeadlines={Object.fromEntries(beigeBookHeadlines)}
            />
          </div>
        </div>
      </div>
    </>
  );
}

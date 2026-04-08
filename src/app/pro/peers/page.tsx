export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import {
  getNationalIndex,
  getPeerIndex,
  getPublicStats,
} from "@/lib/crawler-db";
import { getDisplayName, isFeaturedFee } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { DISTRICT_NAMES, FDIC_TIER_LABELS, FDIC_TIER_ORDER } from "@/lib/fed-districts";
import { SavedGroups } from "./saved-groups";

export const metadata: Metadata = {
  title: "Peer Builder | Bank Fee Index",
};

interface PageProps {
  searchParams: Promise<{
    charter?: string;
    tier?: string;
    district?: string;
  }>;
}

function buildFilterDescription(
  charter: string,
  tiers: string[],
  districts: number[]
): string {
  const parts: string[] = [];
  if (charter === "bank") parts.push("Banks");
  else if (charter === "credit_union") parts.push("Credit Unions");
  if (tiers.length > 0) {
    parts.push(tiers.map((t) => FDIC_TIER_LABELS[t] || t).join(", "));
  }
  if (districts.length > 0) {
    parts.push(
      districts.map((d) => `District ${d} (${DISTRICT_NAMES[d]})`).join(", ")
    );
  }
  return parts.length > 0 ? parts.join(" / ") : "All Institutions";
}

function toggleParam(
  current: string[],
  value: string
): string[] {
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

function buildUrl(
  charter: string,
  tiers: string[],
  districts: number[]
): string {
  const params = new URLSearchParams();
  if (charter) params.set("charter", charter);
  if (tiers.length > 0) params.set("tier", tiers.join(","));
  if (districts.length > 0) params.set("district", districts.join(","));
  const qs = params.toString();
  return qs ? `/pro/peers?${qs}` : "/pro/peers";
}

export default async function ProPeersPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro/peers");
  if (!canAccessPremium(user)) redirect("/subscribe");

  const params = await searchParams;
  const charter = params.charter || "";
  const tiers = params.tier ? params.tier.split(",").filter(Boolean) : [];
  const districts = params.district
    ? params.district
        .split(",")
        .map(Number)
        .filter((d) => d >= 1 && d <= 12)
    : [];

  const hasFilters = charter !== "" || tiers.length > 0 || districts.length > 0;

  // Build filter suffix for fee category links
  const filterSuffix = (() => {
    const p = new URLSearchParams();
    if (charter) p.set("charter", charter);
    if (tiers.length > 0) p.set("tier", tiers.join(","));
    if (districts.length > 0) p.set("district", districts.join(","));
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  })();

  const nationalIndex = await getNationalIndex();
  const peerIndex = hasFilters
    ? await getPeerIndex({
        charter_type: charter || undefined,
        asset_tiers: tiers.length > 0 ? tiers : undefined,
        fed_districts: districts.length > 0 ? districts : undefined,
      })
    : nationalIndex;

  const stats = await getPublicStats();

  const filterDescription = buildFilterDescription(charter, tiers, districts);

  // Build combined table data with delta
  const nationalMap = new Map(
    nationalIndex.map((e) => [e.fee_category, e])
  );

  interface TableRow {
    category: string;
    peerMedian: number | null;
    nationalMedian: number | null;
    deltaPct: number | null;
    peerCount: number;
    featured: boolean;
  }

  const tableRows: TableRow[] = peerIndex
    .filter((e) => e.median_amount !== null)
    .map((e) => {
      const nat = nationalMap.get(e.fee_category);
      const natMedian = nat?.median_amount ?? null;
      let deltaPct: number | null = null;
      if (
        e.median_amount !== null &&
        natMedian !== null &&
        natMedian !== 0
      ) {
        deltaPct =
          ((e.median_amount - natMedian) / Math.abs(natMedian)) * 100;
      }
      return {
        category: e.fee_category,
        peerMedian: e.median_amount,
        nationalMedian: natMedian,
        deltaPct,
        peerCount: e.institution_count,
        featured: isFeaturedFee(e.fee_category),
      };
    })
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return (b.peerCount ?? 0) - (a.peerCount ?? 0);
    });

  const totalPeerInstitutions = hasFilters
    ? Math.max(...peerIndex.map((e) => e.institution_count), 0)
    : stats.total_institutions;

  const totalPeerObservations = peerIndex.reduce(
    (sum, e) => sum + e.observation_count,
    0
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <div className="border-b border-[#E8DFD1] bg-[#FFFDF9]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-[#C44B2E]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C44B2E]">
              Peer Builder
            </span>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Peer Benchmarking
          </h1>
          <p className="mt-2 text-sm text-[#7A7265] max-w-2xl">
            Build custom peer groups by charter type, asset tier, and Federal
            Reserve district. Compare median fee levels against national
            benchmarks to identify competitive positioning.
          </p>
          <div className="mt-4">
            <a
              href={`/pro/brief${filterSuffix}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[#E8DFD1] bg-white px-4 py-2 text-[12px] font-semibold text-[#5A5347] hover:border-[#C44B2E]/40 hover:text-[#C44B2E] transition-colors no-underline"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Download Brief
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
              Peer Institutions
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#1A1815]">
              {totalPeerInstitutions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
              Total Observations
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#1A1815]">
              {totalPeerObservations.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
              Active Filters
            </p>
            <p className="mt-1 text-sm font-medium text-[#5A5347] leading-relaxed">
              {filterDescription}
            </p>
          </div>
        </div>

        {/* Saved Peer Groups */}
        <SavedGroups
          currentCharter={charter}
          currentTiers={tiers}
          currentDistricts={districts}
          hasFilters={hasFilters}
        />

        {/* Filter Controls */}
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm p-5 space-y-4">
          {/* Charter */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
              Charter Type
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "", label: "All" },
                { value: "bank", label: "Bank" },
                { value: "credit_union", label: "Credit Union" },
              ].map((opt) => {
                const active = charter === opt.value;
                return (
                  <Link
                    key={opt.value}
                    href={buildUrl(opt.value, tiers, districts)}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? "bg-[#C44B2E] text-white border-[#C44B2E]"
                        : "bg-white text-[#5A5347] border-[#E8DFD1] hover:border-[#C44B2E]/40 hover:text-[#C44B2E]"
                    }`}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Tier */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
              Asset Tier
            </p>
            <div className="flex flex-wrap gap-2">
              {FDIC_TIER_ORDER.map((tierKey) => {
                const active = tiers.includes(tierKey);
                const nextTiers = toggleParam(tiers, tierKey);
                return (
                  <Link
                    key={tierKey}
                    href={buildUrl(charter, nextTiers, districts)}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? "bg-[#C44B2E] text-white border-[#C44B2E]"
                        : "bg-white text-[#5A5347] border-[#E8DFD1] hover:border-[#C44B2E]/40 hover:text-[#C44B2E]"
                    }`}
                  >
                    {FDIC_TIER_LABELS[tierKey]}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* District */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
              Fed District
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => {
                const active = districts.includes(d);
                const nextDistricts = active
                  ? districts.filter((v) => v !== d)
                  : [...districts, d];
                return (
                  <Link
                    key={d}
                    href={buildUrl(charter, tiers, nextDistricts)}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? "bg-[#C44B2E] text-white border-[#C44B2E]"
                        : "bg-white text-[#5A5347] border-[#E8DFD1] hover:border-[#C44B2E]/40 hover:text-[#C44B2E]"
                    }`}
                  >
                    {d} - {DISTRICT_NAMES[d]}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Clear */}
          {hasFilters && (
            <div className="pt-1">
              <Link
                href="/pro/peers"
                className="text-xs font-medium text-[#C44B2E] hover:text-[#A33D24] transition-colors"
              >
                Clear all filters
              </Link>
            </div>
          )}
        </div>

        {/* Peer Index Table */}
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8DFD1]/60">
            <h2
              className="text-lg font-bold tracking-tight text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              {hasFilters ? "Peer Fee Index" : "National Fee Index"}
            </h2>
            <p className="text-[11px] text-[#A09788] mt-0.5">
              {tableRows.length} fee categories with data
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/80">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
                    Fee Category
                  </th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
                    Peer Median
                  </th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
                    National Median
                  </th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
                    Delta
                  </th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
                    Peer Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  const prevFeatured = i > 0 ? tableRows[i - 1].featured : true;
                  const showDivider = prevFeatured && !row.featured;

                  return (
                    <tr
                      key={row.category}
                      className={`border-b border-[#E8DFD1]/30 hover:bg-[#FAF7F2]/60 transition-colors ${
                        showDivider ? "border-t-2 border-t-[#E8DFD1]/60" : ""
                      }`}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/fees/${row.category}${filterSuffix}`}
                            className="font-medium text-[#1A1815] hover:text-[#C44B2E] transition-colors"
                          >
                            {getDisplayName(row.category)}
                          </Link>
                          {!row.featured && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-[#C4B9A8]">
                              extended
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-medium text-[#1A1815]">
                        {row.peerMedian !== null
                          ? formatAmount(row.peerMedian)
                          : "---"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[#7A7265]">
                        {row.nationalMedian !== null
                          ? formatAmount(row.nationalMedian)
                          : "---"}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {row.deltaPct !== null ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${
                              row.deltaPct < -0.5
                                ? "bg-emerald-50 text-emerald-700"
                                : row.deltaPct > 0.5
                                  ? "bg-red-50 text-red-700"
                                  : "bg-[#F5F0E8] text-[#7A7265]"
                            }`}
                          >
                            {row.deltaPct > 0 ? "+" : ""}
                            {row.deltaPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[#C4B9A8]">---</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[#7A7265]">
                        {row.peerCount.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {tableRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-[#A09788]"
                    >
                      No fee data available for the selected filters. Try
                      broadening your peer group criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

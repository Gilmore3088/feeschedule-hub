import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getNationalIndex, getPeerIndex, type IndexEntry } from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parsePeerFilters, buildFilterDescription } from "@/lib/fed-districts";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  isFeaturedFee,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { CollapsibleSection } from "@/components/collapsible-section";
import { IndexFilters } from "./index-filters";
import { PeerIndexFilters } from "./peer-index-filters";
import { MaturityBadge } from "./maturity-badge";

function IndexTable({ items }: { items: IndexEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/80 text-left">
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 z-10 min-w-[180px]">
              Fee Category
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Median</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">P25</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">P75</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Min</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Max</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Inst.</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">Banks</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">CUs</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">Maturity</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.fee_category}
              className="border-b last:border-0 hover:bg-blue-50/30 transition-colors"
            >
              <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                <Link
                  href={`/admin/fees/catalog/${item.fee_category}`}
                  className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                >
                  {getDisplayName(item.fee_category)}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                {formatAmount(item.median_amount)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {formatAmount(item.p25_amount)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {formatAmount(item.p75_amount)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                {formatAmount(item.min_amount)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                {formatAmount(item.max_amount)}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                {item.institution_count}
              </td>
              <td className="px-4 py-2.5 text-center">
                {item.bank_count > 0 ? (
                  <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {item.bank_count}
                  </span>
                ) : (
                  <span className="text-gray-300">-</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                {item.cu_count > 0 ? (
                  <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                    {item.cu_count}
                  </span>
                ) : (
                  <span className="text-gray-300">-</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center">
                <MaturityBadge
                  tier={item.maturity_tier}
                  approved={item.approved_count}
                  total={item.observation_count}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildFamilySummary(items: IndexEntry[]): string {
  const medians = items
    .map((i) => i.median_amount)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  const medianRange =
    medians.length > 0
      ? `Median ${formatAmount(medians[0])} - ${formatAmount(medians[medians.length - 1])}`
      : "";
  const totalInst = items.reduce((s, i) => s + i.institution_count, 0);
  return `${items.length} categories | ${medianRange} | ${totalInst} observations`;
}

export default async function FeeIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    family?: string;
    approved?: string;
    sort?: string;
    show?: string;
    charter?: string;
    tier?: string;
    district?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const searchTerm = params.q ?? "";
  const activeFamily = params.family ?? "";
  const approvedOnly = params.approved === "1";
  const sortKey = params.sort ?? "institution_count";
  const showAll = params.show === "all";

  const peerFilters = parsePeerFilters(params);
  const hasPeerFilters = peerFilters.charter || peerFilters.tiers || peerFilters.districts;

  let entries: IndexEntry[];
  if (hasPeerFilters) {
    entries = getPeerIndex(
      {
        charter_type: peerFilters.charter,
        asset_tiers: peerFilters.tiers,
        fed_districts: peerFilters.districts,
      },
      approvedOnly
    );
  } else {
    entries = getNationalIndex(approvedOnly);
  }

  const filterDescription = hasPeerFilters ? buildFilterDescription(peerFilters) : null;

  // Search always queries all categories (regardless of tier filter)
  if (searchTerm) {
    entries = entries.filter((e) =>
      getDisplayName(e.fee_category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }

  // Apply tier filter: default to featured only, unless searching or show=all
  if (!showAll && !searchTerm) {
    entries = entries.filter((e) => isFeaturedFee(e.fee_category));
  }

  if (sortKey === "median_amount") {
    entries.sort((a, b) => (b.median_amount ?? 0) - (a.median_amount ?? 0));
  } else if (sortKey === "fee_category") {
    entries.sort((a, b) =>
      getDisplayName(a.fee_category).localeCompare(getDisplayName(b.fee_category))
    );
  }

  const byFamily = new Map<string, IndexEntry[]>();
  const uncategorized: IndexEntry[] = [];

  for (const e of entries) {
    const family = getFeeFamily(e.fee_category);
    if (family) {
      if (activeFamily && family !== activeFamily) continue;
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family)!.push(e);
    } else {
      if (!activeFamily) uncategorized.push(e);
    }
  }

  const familyOrder = Object.keys(FEE_FAMILIES);
  const allFamilies = familyOrder.filter((f) =>
    entries.some((e) => getFeeFamily(e.fee_category) === f)
  );

  const totalCategories = entries.length;
  const strongCount = entries.filter((e) => e.maturity_tier === "strong").length;
  const allMedians = entries
    .map((e) => e.median_amount)
    .filter((m): m is number => m !== null);
  const overallMedian =
    allMedians.length > 0
      ? allMedians.sort((a, b) => a - b)[Math.floor(allMedians.length / 2)]
      : null;

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Fee Index" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          {hasPeerFilters ? "Peer Fee Index" : "National Fee Index"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {hasPeerFilters
            ? filterDescription
            : "Benchmark medians for all fee categories across U.S. financial institutions"}
          {approvedOnly && (
            <span className="ml-2 text-amber-600 font-medium">
              (Approved fees only)
            </span>
          )}
        </p>
      </div>

      {/* Peer Filters */}
      <Suspense fallback={null}>
        <PeerIndexFilters />
      </Suspense>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Index Coverage
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {totalCategories} categories
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            of {showAll || searchTerm ? TAXONOMY_COUNT : FEATURED_COUNT} {showAll || searchTerm ? "in taxonomy" : "featured"}
          </p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Typical Median
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {overallMedian !== null ? formatAmount(overallMedian) : "-"}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            middle of all category medians
          </p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Data Maturity
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {totalCategories > 0
              ? `${((strongCount / totalCategories) * 100).toFixed(0)}%`
              : "0%"}{" "}
            strong
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {strongCount} of {totalCategories} categories with 10+ approved
          </p>
        </div>
      </div>

      {/* Filters */}
      <Suspense fallback={null}>
        <IndexFilters families={allFamilies} />
      </Suspense>

      {/* Family sections */}
      {familyOrder.map((family) => {
        const familyItems = byFamily.get(family);
        if (!familyItems || familyItems.length === 0) return null;
        const colors = getFamilyColor(family);

        return (
          <CollapsibleSection
            key={family}
            title={family}
            summary={buildFamilySummary(familyItems)}
            colorClasses={colors}
            defaultOpen={byFamily.size <= 3}
          >
            <IndexTable items={familyItems} />
          </CollapsibleSection>
        );
      })}

      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <CollapsibleSection
          title="Other"
          summary={`${uncategorized.length} categories`}
          colorClasses={{
            bg: "bg-gray-50",
            text: "text-gray-700",
            border: "border-l-gray-400",
          }}
        >
          <IndexTable items={uncategorized} />
        </CollapsibleSection>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {approvedOnly
            ? "No approved fees yet. Toggle off 'Approved only' to see provisional index."
            : `No fee categories found${searchTerm ? ` matching "${searchTerm}"` : ""}.`}
        </div>
      )}
    </>
  );
}

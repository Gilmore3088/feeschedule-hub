import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getNationalIndex, getPeerIndex, type IndexEntry } from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DistributionBar } from "@/components/distribution-bar";
import { parsePeerFilters, buildFilterDescription } from "@/lib/fed-districts";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  getSpotlightCategories,
  isFeaturedFee,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { CollapsibleSection } from "@/components/collapsible-section";
import { IndexFilters } from "./index-filters";
import { PeerIndexFilters } from "./peer-index-filters";
import { MaturityBadge } from "./maturity-badge";

const FAMILY_DOT_COLORS: Record<string, string> = {
  "Account Maintenance": "bg-blue-500",
  "Overdraft & NSF": "bg-red-500",
  "ATM & Card": "bg-amber-500",
  "Wire Transfers": "bg-purple-500",
  "Check Services": "bg-slate-500",
  "Digital & Electronic": "bg-cyan-500",
  "Cash & Deposit": "bg-emerald-500",
  "Account Services": "bg-indigo-500",
  "Lending Fees": "bg-orange-500",
};

function CharterMixBar({
  bankCount,
  cuCount,
}: {
  bankCount: number;
  cuCount: number;
}) {
  const total = bankCount + cuCount;
  if (total === 0) return <span className="text-gray-300">-</span>;
  const bankWidth = Math.max((bankCount / total) * 40, 0);

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${bankCount} banks, ${cuCount} credit unions`}
    >
      <svg width={40} height={8} aria-hidden="true">
        <rect
          width={40}
          height={8}
          rx={4}
          fill="currentColor"
          className="text-emerald-200 dark:text-emerald-700"
        />
        <rect
          width={bankWidth}
          height={8}
          rx={4}
          fill="currentColor"
          className="text-blue-400 dark:text-blue-500"
        />
      </svg>
      <span className="text-[10px] tabular-nums text-gray-400 whitespace-nowrap">
        {total}
      </span>
    </div>
  );
}

function IndexTable({ items }: { items: IndexEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/80 text-left">
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/80 z-10 min-w-[180px]">
              Fee Category
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
              Median
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center min-w-[160px]">
              <span className="block">Distribution</span>
              <span className="block text-[9px] font-normal tracking-normal normal-case text-gray-300">
                P25 - P75 range
              </span>
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
              Inst.
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Charter Mix
            </th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">
              Maturity
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const family = getFeeFamily(item.fee_category);
            const dotColor = family
              ? (FAMILY_DOT_COLORS[family] ?? "bg-gray-400")
              : "bg-gray-400";
            return (
              <tr
                key={item.fee_category}
                className="border-b last:border-0 hover:bg-blue-50/30 transition-colors"
              >
                <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
                    />
                    <Link
                      href={`/admin/fees/catalog/${item.fee_category}`}
                      className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                    >
                      {getDisplayName(item.fee_category)}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                  {formatAmount(item.median_amount)}
                </td>
                <td className="px-4 py-2.5">
                  <DistributionBar
                    min={item.min_amount}
                    p25={item.p25_amount}
                    median={item.median_amount}
                    p75={item.p75_amount}
                    max={item.max_amount}
                  />
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                  {item.institution_count}
                </td>
                <td className="px-4 py-2.5">
                  <CharterMixBar
                    bankCount={item.bank_count}
                    cuCount={item.cu_count}
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <MaturityBadge
                    tier={item.maturity_tier}
                    approved={item.approved_count}
                    total={item.observation_count}
                  />
                </td>
              </tr>
            );
          })}
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

  // Apply tier filter: default to featured only, unless searching or show=all
  if (!showAll && !searchTerm) {
    entries = entries.filter((e) => isFeaturedFee(e.fee_category));
  }

  // Extract spotlight entries before search/family narrowing
  const spotlightCats = new Set(getSpotlightCategories());
  const spotlightEntries = entries.filter((e) => spotlightCats.has(e.fee_category));

  // Search filter
  if (searchTerm) {
    entries = entries.filter((e) =>
      getDisplayName(e.fee_category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
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

  // Summary card computations
  const highestEntry = entries.reduce<IndexEntry | null>(
    (best, e) =>
      !best || (e.median_amount ?? 0) > (best.median_amount ?? 0) ? e : best,
    null
  );

  const widestEntry = entries.reduce<IndexEntry | null>((best, e) => {
    if (
      e.p25_amount === null ||
      e.p75_amount === null ||
      e.median_amount === null ||
      e.median_amount === 0
    )
      return best;
    const relSpread = (e.p75_amount - e.p25_amount) / e.median_amount;
    if (!best) return e;
    const bestIqr = (best.p75_amount ?? 0) - (best.p25_amount ?? 0);
    const bestRelSpread =
      (best.median_amount ?? 1) > 0
        ? bestIqr / (best.median_amount ?? 1)
        : 0;
    return relSpread > bestRelSpread ? e : best;
  }, null);

  const widestIqr =
    widestEntry &&
    widestEntry.p75_amount !== null &&
    widestEntry.p25_amount !== null
      ? widestEntry.p75_amount - widestEntry.p25_amount
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

      {/* Spotlight hero strip */}
      {spotlightEntries.length > 0 && !searchTerm && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {spotlightEntries.map((entry) => {
            const family = getFeeFamily(entry.fee_category);
            const colors = family
              ? getFamilyColor(family)
              : { border: "border-l-gray-400", bg: "bg-gray-50", text: "text-gray-700" };
            return (
              <Link
                key={entry.fee_category}
                href={`/admin/fees/catalog/${entry.fee_category}`}
                className={`group rounded-lg border border-l-[3px] ${colors.border} bg-white px-3 py-2.5 hover:shadow-sm transition-shadow`}
              >
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                  {getDisplayName(entry.fee_category)}
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900 mt-0.5 group-hover:text-blue-600 transition-colors">
                  {formatAmount(entry.median_amount)}
                </p>
                <div className="mt-1.5 text-gray-400">
                  <DistributionBar
                    min={entry.min_amount}
                    p25={entry.p25_amount}
                    median={entry.median_amount}
                    p75={entry.p75_amount}
                    max={entry.max_amount}
                    width={100}
                    height={14}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {entry.institution_count} inst
                  </span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      entry.maturity_tier === "strong"
                        ? "bg-emerald-400"
                        : entry.maturity_tier === "provisional"
                          ? "bg-amber-400"
                          : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    title={entry.maturity_tier}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Highest Fee
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {highestEntry ? formatAmount(highestEntry.median_amount) : "-"}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {highestEntry
              ? getDisplayName(highestEntry.fee_category)
              : "No data"}
          </p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Widest Price Spread
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {widestIqr !== null ? formatAmount(widestIqr) : "-"}
            {widestIqr !== null && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                IQR
              </span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {widestEntry
              ? getDisplayName(widestEntry.fee_category)
              : "No data"}
          </p>
        </div>
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Data Maturity
          </p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">
            {strongCount} of {totalCategories}
            <span className="text-xs font-normal text-gray-400 ml-1">
              strong
            </span>
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${totalCategories > 0 ? (strongCount / totalCategories) * 100 : 0}%`,
              }}
            />
          </div>
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

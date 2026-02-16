import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getFeeCategorySummaries, type FeeCategorySummary } from "@/lib/crawler-db";
import { formatAmount } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
} from "@/lib/fee-taxonomy";
import { CollapsibleSection } from "@/components/collapsible-section";
import { CatalogFilters } from "@/components/catalog-filters";
import { FeeRangeChart } from "@/components/fee-range-chart";
import { CatalogActions } from "@/components/catalog-actions";

function FamilyTable({
  items,
  showAllColumns,
}: {
  items: FeeCategorySummary[];
  showAllColumns: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2.5 font-medium sticky left-0 bg-gray-50 z-10 min-w-[180px]">
              Fee Type
            </th>
            <th className="px-4 py-2.5 font-medium text-right">Inst.</th>
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-right">Min</th>
            )}
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-right">P25</th>
            )}
            <th className="px-4 py-2.5 font-medium text-right">Median</th>
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-right">P75</th>
            )}
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-right">Max</th>
            )}
            <th className="px-4 py-2.5 font-medium text-right">Spread</th>
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-center">Banks</th>
            )}
            {showAllColumns && (
              <th className="px-4 py-2.5 font-medium text-center">CUs</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const spread =
              item.max_amount !== null && item.min_amount !== null
                ? item.max_amount - item.min_amount
                : null;
            return (
              <tr
                key={item.fee_category}
                className="border-b last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                  <Link
                    href={`/admin/fees/catalog/${item.fee_category}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {getDisplayName(item.fee_category)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                  {item.institution_count}
                </td>
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {formatAmount(item.min_amount)}
                  </td>
                )}
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {formatAmount(item.p25_amount)}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                  {formatAmount(item.median_amount)}
                </td>
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {formatAmount(item.p75_amount)}
                  </td>
                )}
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {formatAmount(item.max_amount)}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                  {spread !== null ? formatAmount(spread) : "-"}
                </td>
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-center">
                    {item.bank_count > 0 ? (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {item.bank_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                )}
                {showAllColumns && (
                  <td className="px-4 py-2.5 text-center">
                    {item.cu_count > 0 ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {item.cu_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildFamilySummary(items: FeeCategorySummary[]): string {
  const medians = items
    .map((i) => i.median_amount)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  const medianRange =
    medians.length > 0
      ? `Median ${formatAmount(medians[0])} - ${formatAmount(medians[medians.length - 1])}`
      : "";
  const totalInst = items.reduce((s, i) => s + i.institution_count, 0);
  return `${items.length} fee type${items.length !== 1 ? "s" : ""} | ${medianRange} | ${totalInst} observations`;
}

export default async function FeeCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    family?: string;
    sort?: string;
    columns?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const searchTerm = params.search ?? "";
  const activeFamily = params.family ?? "";
  const sortKey = params.sort ?? "institution_count";
  const showAllColumns = params.columns === "full";

  let summaries = getFeeCategorySummaries();

  // Server-side search filter
  if (searchTerm) {
    summaries = summaries.filter((s) =>
      getDisplayName(s.fee_category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }

  // Server-side sort
  if (sortKey === "median_amount") {
    summaries.sort(
      (a, b) => (b.median_amount ?? 0) - (a.median_amount ?? 0)
    );
  } else if (sortKey === "spread") {
    summaries.sort((a, b) => {
      const spreadA =
        a.max_amount !== null && a.min_amount !== null
          ? a.max_amount - a.min_amount
          : 0;
      const spreadB =
        b.max_amount !== null && b.min_amount !== null
          ? b.max_amount - b.min_amount
          : 0;
      return spreadB - spreadA;
    });
  } else if (sortKey === "fee_category") {
    summaries.sort((a, b) =>
      getDisplayName(a.fee_category).localeCompare(
        getDisplayName(b.fee_category)
      )
    );
  }
  // default: institution_count (already sorted by DB query)

  // Group summaries by family
  const byFamily = new Map<string, FeeCategorySummary[]>();
  const uncategorized: FeeCategorySummary[] = [];

  for (const s of summaries) {
    const family = getFeeFamily(s.fee_category);
    if (family) {
      if (activeFamily && family !== activeFamily) continue;
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family)!.push(s);
    } else {
      if (!activeFamily) uncategorized.push(s);
    }
  }

  const familyOrder = Object.keys(FEE_FAMILIES);
  const allFamilies = familyOrder.filter(
    (f) => summaries.some((s) => getFeeFamily(s.fee_category) === f)
  );

  const totalCategories = summaries.length;
  const totalObservations = summaries.reduce(
    (s, r) => s + r.total_observations,
    0
  );

  // Insight computations
  const highestMedian = [...summaries].sort(
    (a, b) => (b.median_amount ?? 0) - (a.median_amount ?? 0)
  )[0];
  const widestSpread = [...summaries].sort((a, b) => {
    const sa =
      a.max_amount !== null && a.min_amount !== null
        ? a.max_amount - a.min_amount
        : 0;
    const sb =
      b.max_amount !== null && b.min_amount !== null
        ? b.max_amount - b.min_amount
        : 0;
    return sb - sa;
  })[0];
  const mostCommon = [...summaries].sort(
    (a, b) => b.institution_count - a.institution_count
  )[0];

  return (
    <>
      <div className="mb-6">
        <div className="print:hidden">
          <Breadcrumbs items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Fee Catalog" },
          ]} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Fee Catalog</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Fee types across all institutions, grouped by category
            </p>
          </div>
          <CatalogActions />
        </div>
      </div>

      {/* Insight cards */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {mostCommon && (
            <Link
              href={`/admin/fees/catalog/${mostCommon.fee_category}`}
              className="rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Most Common Fee
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {getDisplayName(mostCommon.fee_category)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {mostCommon.institution_count} institutions
              </p>
            </Link>
          )}
          {highestMedian && (
            <Link
              href={`/admin/fees/catalog/${highestMedian.fee_category}`}
              className="rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Highest Median Fee
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {getDisplayName(highestMedian.fee_category)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatAmount(highestMedian.median_amount)} median
              </p>
            </Link>
          )}
          {widestSpread && (
            <Link
              href={`/admin/fees/catalog/${widestSpread.fee_category}`}
              className="rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Widest Spread
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {getDisplayName(widestSpread.fee_category)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatAmount(
                  (widestSpread.max_amount ?? 0) -
                    (widestSpread.min_amount ?? 0)
                )}{" "}
                range
              </p>
            </Link>
          )}
        </div>
      )}

      {/* Filters */}
      <Suspense fallback={null}>
        <CatalogFilters families={allFamilies} />
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
            defaultOpen={byFamily.size === 1}
          >
            {familyItems.length >= 2 && (
              <FeeRangeChart
                items={familyItems}
                accentColor={colors.border}
              />
            )}
            <FamilyTable
              items={familyItems}
              showAllColumns={showAllColumns}
            />
          </CollapsibleSection>
        );
      })}

      {/* Uncategorized fees */}
      {uncategorized.length > 0 && (
        <CollapsibleSection
          title="Other"
          summary={`${uncategorized.length} fee type${uncategorized.length !== 1 ? "s" : ""}`}
          colorClasses={{
            bg: "bg-gray-50",
            text: "text-gray-700",
            border: "border-l-gray-400",
          }}
        >
          <FamilyTable
            items={uncategorized}
            showAllColumns={showAllColumns}
          />
        </CollapsibleSection>
      )}

      {summaries.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No fee categories found
          {searchTerm ? ` matching "${searchTerm}"` : ""}.
        </div>
      )}
    </>
  );
}

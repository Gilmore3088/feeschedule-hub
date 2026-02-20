import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNationalIndex, getStateFeeStats } from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily, FEE_FAMILIES, FAMILY_COLORS } from "@/lib/fee-taxonomy";
import { STATE_NAMES, STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

const ALL_CATEGORIES = new Set(Object.values(FEE_FAMILIES).flat());

export async function generateStaticParams() {
  return [];
}

export const dynamicParams = true;
export const revalidate = 604800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; state: string }>;
}): Promise<Metadata> {
  const { category, state } = await params;
  const stateCode = state.toUpperCase();
  const displayName = getDisplayName(category);
  const stateName = STATE_NAMES[stateCode] ?? state;

  return {
    title: `${displayName} Fees in ${stateName}: 2026 Benchmark | Bank Fee Index`,
    description: `${displayName} fee benchmark data for ${stateName}. Compare local medians to the national average across banks and credit unions.`,
    alternates: { canonical: `/fees/${category}/by-state/${stateCode.toLowerCase()}` },
  };
}

export default async function StateBreakdownPage({
  params,
}: {
  params: Promise<{ category: string; state: string }>;
}) {
  const { category, state } = await params;
  const stateCode = state.toUpperCase();
  if (!ALL_CATEGORIES.has(category)) notFound();
  if (!STATE_NAMES[stateCode]) notFound();
  const displayName = getDisplayName(category);
  const stateName = STATE_NAMES[stateCode];
  const district = STATE_TO_DISTRICT[stateCode];
  const family = getFeeFamily(category);
  const familyColor = family ? FAMILY_COLORS[family] : null;

  const stateStats = getStateFeeStats(category, stateCode);
  const nationalEntries = getNationalIndex();
  const nationalEntry = nationalEntries.find(
    (e) => e.fee_category === category
  );

  if (!stateStats || !nationalEntry) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <nav className="mb-6 text-[13px] text-slate-400">
          <Link
            href="/fees"
            className="hover:text-slate-600 transition-colors"
          >
            Fee Index
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/fees/${category}`}
            className="hover:text-slate-600 transition-colors"
          >
            {displayName}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-600">{stateName}</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900">
          {displayName} in {stateName}
        </h1>
        <p className="mt-4 text-slate-500">
          No fee data available for {displayName.toLowerCase()} in {stateName}{" "}
          yet.
        </p>
        <Link
          href={`/fees/${category}`}
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          View national data
        </Link>
      </div>
    );
  }

  const natMedian = nationalEntry.median_amount;
  const stateMedian = stateStats.median_amount;
  const delta =
    stateMedian != null && natMedian != null && natMedian > 0
      ? ((stateMedian - natMedian) / natMedian) * 100
      : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: displayName, href: `/fees/${category}` },
          { name: "By State", href: `/fees/${category}/by-state` },
          { name: stateName, href: `/fees/${category}/by-state/${stateCode.toLowerCase()}` },
        ]}
      />
      {/* Breadcrumb */}
      <nav className="mb-6 text-[13px] text-slate-400">
        <Link href="/fees" className="hover:text-slate-600 transition-colors">
          Fee Index
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/fees/${category}`}
          className="hover:text-slate-600 transition-colors"
        >
          {displayName}
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/fees/${category}/by-state`}
          className="hover:text-slate-600 transition-colors"
        >
          By State
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{stateName}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          {family && familyColor && (
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${familyColor.bg} ${familyColor.text}`}
            >
              {family}
            </span>
          )}
          {district && (
            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              District {district} - {DISTRICT_NAMES[district]}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {displayName} in {stateName}
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Data from {stateStats.institution_count} institutions in {stateName}.
        </p>
      </div>

      {/* Comparison cards */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {stateName} Median
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatAmount(stateMedian)}
          </p>
          {delta != null && (
            <p className="mt-1">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  delta < 0
                    ? "bg-emerald-50 text-emerald-600"
                    : delta > 0
                      ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)}% vs national
              </span>
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            National Median
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {formatAmount(natMedian)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {nationalEntry.institution_count.toLocaleString()} institutions
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {stateName} Range
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-700">
            {formatAmount(stateStats.p25_amount)} -{" "}
            {formatAmount(stateStats.p75_amount)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            P25 - P75 interquartile range
          </p>
        </div>
      </div>

      {/* Charter breakdown */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
          Institution Breakdown
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Total
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {stateStats.institution_count}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Banks
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-700">
              {stateStats.bank_count}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Credit Unions
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-700">
              {stateStats.cu_count}
            </p>
          </div>
        </div>
      </section>

      {/* Lowest fees */}
      {stateStats.top_lowest.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Lowest {displayName} Fees in {stateName}
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Institution
                  </th>
                  <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    City
                  </th>
                  <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stateStats.top_lowest.map((inst, i) => (
                  <tr
                    key={i}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-900">
                      {inst.institution_name}
                    </td>
                    <td className="hidden px-4 py-2.5 text-sm text-slate-500 sm:table-cell">
                      {inst.city ?? "-"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-sm text-slate-500 sm:table-cell">
                      {inst.charter_type === "bank" ? "Bank" : "Credit Union"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatAmount(inst.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Fee amounts reflect disclosed fee schedules and may not reflect
            promotional rates or waived fees.
          </p>
        </section>
      )}

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/fees/${category}`}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          View national {displayName.toLowerCase()} data
        </Link>
        {district && (
          <Link
            href={`/districts/${district}`}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            District {district} - {DISTRICT_NAMES[district]}
          </Link>
        )}
        <Link
          href={`/fees/${category}/by-state`}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          Compare all states
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getStateIndex,
  getStateInstitutions,
  getNationalIndex,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeTier,
  isFeaturedFee,
} from "@/lib/fee-taxonomy";
import {
  STATE_NAMES,
  STATE_TO_DISTRICT,
  DISTRICT_NAMES,
} from "@/lib/fed-districts";
import { US_STATES } from "@/lib/us-map-paths";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataQualityBanner, getDataQuality } from "@/components/data-quality-banner";

export async function generateStaticParams() {
  return [];
}
export const dynamicParams = true;
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const stateCode = state.toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) return { title: "State Not Found" };

  const { getStatesWithData } = await import("@/lib/crawler-db");
  const statesData = getStatesWithData();
  const stateData = statesData.find(
    (s) => s.state_code === stateCode
  );
  const instCount = stateData?.institution_count ?? 0;

  return {
    title: `${stateName} Bank Fees: Compare Local Rates | Bank Fee Index`,
    description: `Compare banking fees across ${stateName} institutions. See how local banks and credit unions stack up against national medians for overdraft, maintenance, ATM, and more.`,
    alternates: { canonical: `/states/${state.toLowerCase()}` },
    ...(instCount < 5 ? { robots: { index: false } } : {}),
  };
}

export default async function StateOverviewPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const stateCode = state.toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) notFound();

  const district = STATE_TO_DISTRICT[stateCode];
  const stateIndex = getStateIndex(stateCode);
  const nationalIndex = getNationalIndex();
  const institutions = getStateInstitutions(stateCode, 25);

  const nationalMap = new Map(
    nationalIndex.map((e) => [e.fee_category, e.median_amount])
  );

  const enriched = stateIndex.map((entry) => {
    const natMedian = nationalMap.get(entry.fee_category) ?? null;
    let deltaPct: number | null = null;
    if (
      entry.state_median !== null &&
      natMedian !== null &&
      natMedian > 0
    ) {
      deltaPct =
        ((entry.state_median - natMedian) / natMedian) * 100;
    }
    return { ...entry, national_median: natMedian, delta_pct: deltaPct };
  });

  const featured = enriched.filter((e) => isFeaturedFee(e.fee_category));
  const extended = enriched.filter((e) => !isFeaturedFee(e.fee_category));

  const tierOrder = { spotlight: 0, core: 1, extended: 2, comprehensive: 3 };
  const sortByTier = (
    a: (typeof enriched)[0],
    b: (typeof enriched)[0]
  ) => {
    const aTier = tierOrder[getFeeTier(a.fee_category)] ?? 4;
    const bTier = tierOrder[getFeeTier(b.fee_category)] ?? 4;
    if (aTier !== bTier) return aTier - bTier;
    return b.institution_count - a.institution_count;
  };
  featured.sort(sortByTier);
  extended.sort(sortByTier);

  const totalInstitutions = new Set(
    institutions.map((i) => i.id)
  ).size;
  const bankCount = institutions.filter(
    (i) => i.charter_type === "bank"
  ).length;
  const cuCount = institutions.filter(
    (i) => i.charter_type !== "bank"
  ).length;

  const belowNational = featured.filter(
    (e) => e.delta_pct !== null && e.delta_pct < 0
  ).length;

  const svgState = US_STATES.find(
    (s) => s.id === stateCode
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "States", href: "/states" },
          { name: stateName, href: `/states/${state.toLowerCase()}` },
        ]}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-6 text-[13px] text-slate-400"
      >
        <Link
          href="/states"
          className="hover:text-slate-600 transition-colors"
        >
          States
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-600" aria-current="page">
          {stateName}
        </span>
      </nav>

      <DataQualityBanner
        quality={getDataQuality(totalInstitutions)}
        count={totalInstitutions}
      />

      {/* Header with SVG map */}
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
              {stateCode}
            </span>
            {district && (
              <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                District {district} - {DISTRICT_NAMES[district]}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {stateName} Banking Fees
          </h1>
          <p className="mt-1 text-[15px] text-slate-500">
            Fee benchmarks across {totalInstitutions} institution
            {totalInstitutions !== 1 ? "s" : ""} in {stateName}
          </p>
        </div>

        {/* Mini state map */}
        {svgState && (
          <div className="flex-shrink-0 w-28 h-28 sm:w-32 sm:h-32">
            <svg
              viewBox="0 0 960 600"
              className="w-full h-full"
              aria-hidden="true"
            >
              {US_STATES.map((s) => (
                <path
                  key={s.id}
                  d={s.d}
                  fill={s.id === stateCode ? "#334155" : "#e2e8f0"}
                  stroke="#fff"
                  strokeWidth="1"
                />
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Institutions
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {totalInstitutions}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {bankCount} bank{bankCount !== 1 ? "s" : ""}, {cuCount} CU
            {cuCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Fee Categories
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {stateIndex.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">of 49 tracked</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Below National
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {belowNational} of {featured.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            featured fees cheaper
          </p>
        </div>
        {district && (
          <Link
            href={`/districts/${district}`}
            className="rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300 transition-colors"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Fed District
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {district}
            </p>
            <p className="mt-1 text-[11px] text-blue-500">
              {DISTRICT_NAMES[district]}
            </p>
          </Link>
        )}
      </div>

      {/* Fee Index Table */}
      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Fee Index
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <caption className="sr-only">
                {stateName} fee index compared to national medians
              </caption>
              <thead>
                <tr className="bg-slate-50/80">
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {stateCode} Median
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell"
                  >
                    National
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    vs National
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell"
                  >
                    Institutions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featured.map((entry) => (
                  <FeeRow
                    key={entry.fee_category}
                    entry={entry}
                    stateCode={stateCode}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {extended.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Show {extended.length} more fee categories
              </summary>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {extended.map((entry) => (
                      <FeeRow
                        key={entry.fee_category}
                        entry={entry}
                        stateCode={stateCode}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}

      {/* Institutions in this state */}
      {institutions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Institutions in {stateName}
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <caption className="sr-only">
                Financial institutions in {stateName} with fee data
              </caption>
              <thead>
                <tr className="bg-slate-50/80">
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Institution
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell"
                  >
                    Size
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Fees
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutions.map((inst) => (
                  <tr
                    key={inst.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/institutions/${inst.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {inst.institution_name}
                      </Link>
                      {inst.city && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {inst.city}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 text-sm text-slate-500 sm:table-cell">
                      {inst.charter_type === "bank" ? "Bank" : "Credit Union"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-[11px] text-slate-400 md:table-cell">
                      {inst.asset_size_tier ?? "--"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-600">
                      {inst.fee_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalInstitutions > 25 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Showing top 25 of {totalInstitutions} institutions by fee
              coverage.{" "}
              <Link
                href={`/institutions?state=${stateCode.toLowerCase()}`}
                className="text-blue-500 hover:text-blue-600 transition-colors"
              >
                View all
              </Link>
            </p>
          )}
        </section>
      )}

      {/* Cross-links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          National Fee Index
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
          href="/states"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          All States
        </Link>
      </div>
    </div>
  );
}

function FeeRow({
  entry,
  stateCode,
}: {
  entry: {
    fee_category: string;
    state_median: number | null;
    national_median: number | null;
    delta_pct: number | null;
    institution_count: number;
  };
  stateCode: string;
}) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          href={`/fees/${entry.fee_category}/by-state/${stateCode.toLowerCase()}`}
          className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
        >
          {getDisplayName(entry.fee_category)}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
        {formatAmount(entry.state_median)}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
        {formatAmount(entry.national_median)}
      </td>
      <td className="px-4 py-2.5 text-right">
        {entry.delta_pct != null ? (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              entry.delta_pct < 0
                ? "bg-emerald-50 text-emerald-600"
                : entry.delta_pct > 0
                  ? "bg-red-50 text-red-600"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {entry.delta_pct > 0 ? "+" : ""}
            {entry.delta_pct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-[11px] text-slate-300">--</span>
        )}
      </td>
      <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-400 md:table-cell">
        {entry.institution_count}
      </td>
    </tr>
  );
}

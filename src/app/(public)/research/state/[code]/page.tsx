import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getNationalIndex,
  getPeerIndex,
  getStateStats,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  FEE_FAMILIES,
  FEATURED_COUNT,
  isFeaturedFee,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { STATE_NAMES, STATE_CODES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataFreshness } from "@/components/data-freshness";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateStaticParams() {
  return STATE_CODES.map((code) => ({ code }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const name = STATE_NAMES[code.toUpperCase()];
  if (!name) return { title: "State Not Found" };

  return {
    title: `${name} Bank Fees - State Fee Report`,
    description: `Compare bank and credit union fees in ${name}. Median fees, state vs. national benchmarks, charter type comparisons, and institution-level data.`,
    keywords: [
      `${name} bank fees`,
      `${name} overdraft fees`,
      `${name} credit union fees`,
      `bank fees by state`,
      `${name} ATM fees`,
    ],
  };
}

function DeltaPill({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.5) {
    return <span className="text-[11px] text-slate-400">-</span>;
  }
  const isBelow = delta < 0;
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        isBelow
          ? "bg-emerald-50 text-emerald-600"
          : "bg-red-50 text-red-600"
      }`}
    >
      {isBelow ? "" : "+"}{delta.toFixed(1)}%
    </span>
  );
}

export default async function StateReportPage({ params }: PageProps) {
  const { code } = await params;
  const stateCode = code.toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) notFound();

  const stats = getStateStats(stateCode);
  const stateIndex = getPeerIndex({ state_code: stateCode });
  const nationalIndex = getNationalIndex();
  const district = STATE_TO_DISTRICT[stateCode];

  // Build national lookup
  const nationalMap = new Map(
    nationalIndex.map((e) => [e.fee_category, e])
  );

  // Build comparison data: state vs national with deltas
  const comparisons = stateIndex
    .filter((e) => e.median_amount !== null && e.institution_count >= 3)
    .map((entry) => {
      const national = nationalMap.get(entry.fee_category);
      const nationalMedian = national?.median_amount ?? null;
      const delta =
        nationalMedian && entry.median_amount
          ? ((entry.median_amount - nationalMedian) / nationalMedian) * 100
          : null;
      return { ...entry, nationalMedian, delta };
    })
    .sort((a, b) => b.institution_count - a.institution_count);

  const featured = comparisons.filter((c) => isFeaturedFee(c.fee_category));
  const extended = comparisons.filter((c) => !isFeaturedFee(c.fee_category));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
          { name: stateName, href: `/research/state/${stateCode}` },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        State Fee Report
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {stateName} Bank & Credit Union Fees
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        Fee benchmarks for {stats.institution_count.toLocaleString()} financial
        institutions in {stateName}, compared against national medians.
        {district && (
          <>
            {" "}Part of{" "}
            <Link
              href={`/research/district/${district}`}
              className="text-blue-600 hover:underline"
            >
              Federal Reserve District {district} ({DISTRICT_NAMES[district]})
            </Link>
            .
          </>
        )}
      </p>
      <div className="mt-1">
        <DataFreshness />
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Institutions", value: stats.institution_count.toLocaleString() },
          { label: "With Fee Data", value: stats.with_fees.toLocaleString() },
          { label: "Banks", value: stats.bank_count.toLocaleString() },
          { label: "Credit Unions", value: stats.cu_count.toLocaleString() },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 px-4 py-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charter breakdown */}
      {stateIndex.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Bank vs. Credit Union — {stateName}
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            How fees compare between banks and credit unions in this state.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Charter
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Institutions
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee Observations
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">Banks</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {stats.bank_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {stateIndex.reduce((sum, e) => sum + e.bank_count, 0).toLocaleString()}
                  </td>
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">Credit Unions</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {stats.cu_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {stateIndex.reduce((sum, e) => sum + e.cu_count, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Fee comparison table */}
      {comparisons.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Fee Benchmarks — {stateName} vs. National
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {comparisons.length} fee categories with sufficient data.
            Green deltas indicate below-national fees; red indicates above.
          </p>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee Category
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {stateName} Median
                  </th>
                  <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    National Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Delta
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Institutions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featured.map((row) => (
                  <tr
                    key={row.fee_category}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/fees/${row.fee_category}`}
                        className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {getDisplayName(row.fee_category)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(row.median_amount)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                      {formatAmount(row.nationalMedian)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.delta !== null ? (
                        <DeltaPill delta={row.delta} />
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {row.institution_count.toLocaleString()}
                    </td>
                  </tr>
                ))}

                {extended.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-slate-50/80 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                      >
                        Extended Categories
                      </td>
                    </tr>
                    {extended.map((row) => (
                      <tr
                        key={row.fee_category}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/fees/${row.fee_category}`}
                            className="text-slate-700 hover:text-blue-600 transition-colors"
                          >
                            {getDisplayName(row.fee_category)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {formatAmount(row.median_amount)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                          {formatAmount(row.nationalMedian)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.delta !== null ? (
                            <DeltaPill delta={row.delta} />
                          ) : (
                            <span className="text-[11px] text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {row.institution_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Methodology */}
      <section className="mt-10 rounded-lg border border-slate-200 bg-slate-50/50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Methodology
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Data sourced from published fee schedules of FDIC-insured banks and
          NCUA-insured credit unions in {stateName}. Medians computed from
          extracted fee amounts excluding rejected reviews. Delta shows
          percentage difference from the national median. Institutions with
          fewer than 3 observations per category are excluded from state-level
          reporting.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${stateName} Bank & Credit Union Fees`,
            description: `Fee benchmarks for financial institutions in ${stateName}.`,
            url: `https://bankfeeindex.com/research/state/${stateCode}`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

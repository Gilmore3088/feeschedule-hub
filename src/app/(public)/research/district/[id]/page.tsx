import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getNationalIndex,
  getPeerIndex,
  getDistrictStats,
  getBeigeBookHeadline,
  getLatestBeigeBook,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  isFeaturedFee,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataFreshness } from "@/components/data-freshness";

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const districtId = parseInt(id, 10);
  const name = DISTRICT_NAMES[districtId];
  if (!name) return { title: "District Not Found" };

  return {
    title: `Federal Reserve District ${districtId} (${name}) - Fee Analysis`,
    description: `Bank and credit union fee analysis for Federal Reserve District ${districtId} (${name}). District vs. national fee benchmarks with economic context from the Beige Book.`,
    keywords: [
      `Federal Reserve District ${districtId}`,
      `${name} bank fees`,
      `Fed district fee analysis`,
      `banking fees ${name}`,
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

export default async function DistrictReportPage({ params }: PageProps) {
  const { id } = await params;
  const districtId = parseInt(id, 10);
  if (districtId < 1 || districtId > 12 || isNaN(districtId)) notFound();

  const districtName = DISTRICT_NAMES[districtId];
  if (!districtName) notFound();

  const stats = getDistrictStats(districtId);
  const districtIndex = getPeerIndex({ fed_districts: [districtId] });
  const nationalIndex = getNationalIndex();
  const beigeHeadline = getBeigeBookHeadline(districtId);
  const beigeSections = getLatestBeigeBook(districtId);

  // States in this district
  const districtStates = Object.entries(STATE_TO_DISTRICT)
    .filter(([, d]) => d === districtId)
    .map(([code]) => code)
    .filter((code) => STATE_NAMES[code])
    .sort();

  // Build national lookup
  const nationalMap = new Map(
    nationalIndex.map((e) => [e.fee_category, e])
  );

  // Build comparison data
  const comparisons = districtIndex
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

  // Summary stats
  const aboveNational = comparisons.filter((c) => c.delta !== null && c.delta > 2).length;
  const belowNational = comparisons.filter((c) => c.delta !== null && c.delta < -2).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
          { name: `District ${districtId}`, href: `/research/district/${districtId}` },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Federal Reserve District {districtId}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {districtName} District Fee Analysis
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        Fee benchmarks for {stats.institution_count.toLocaleString()} financial
        institutions across{" "}
        {districtStates.length} state{districtStates.length !== 1 ? "s" : ""}.
        {aboveNational > 0 && belowNational > 0 && (
          <> This district has {belowNational} fee categories below the
          national median and {aboveNational} above.</>
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

      {/* States in district */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-slate-800">
          States in This District
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {districtStates.map((code) => (
            <Link
              key={code}
              href={`/research/state/${code}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-600"
            >
              {STATE_NAMES[code]}
            </Link>
          ))}
        </div>
      </section>

      {/* Beige Book Context */}
      {beigeHeadline && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Economic Context — Beige Book
          </h2>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/30 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
              Latest Release — {beigeHeadline.release_date}
            </p>
            {beigeSections
              .filter((s) => s.section_name === "Summary of Economic Activity")
              .map((section) => (
                <p
                  key={section.id}
                  className="mt-2 text-[13px] leading-relaxed text-slate-700"
                >
                  {section.content_text.length > 600
                    ? section.content_text.slice(0, 597) + "..."
                    : section.content_text}
                </p>
              ))}
          </div>
        </section>
      )}

      {/* Fee comparison table */}
      {comparisons.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Fee Benchmarks — District {districtId} vs. National
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {comparisons.length} fee categories with sufficient data.
          </p>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee Category
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    District Median
                  </th>
                  <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    National Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Delta
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Banks
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    CUs
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
                      {row.bank_count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {row.cu_count}
                    </td>
                  </tr>
                ))}

                {extended.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={6}
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
                          {row.bank_count}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {row.cu_count}
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
          NCUA-insured credit unions in Federal Reserve District {districtId} ({districtName}).
          Medians computed from extracted fee amounts excluding rejected reviews.
          Economic context from the Federal Reserve Beige Book. Delta shows
          percentage difference from the national median.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${districtName} District Fee Analysis`,
            description: `Bank and credit union fee analysis for Federal Reserve District ${districtId}.`,
            url: `https://bankfeeindex.com/research/district/${districtId}`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

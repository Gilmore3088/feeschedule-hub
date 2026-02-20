import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import {
  getPeerIndex,
  getLatestBeigeBook,
  getDistrictContent,
  getDistrictIndicators,
} from "@/lib/crawler-db";
import {
  DISTRICT_NAMES,
  STATE_NAMES,
  STATE_TO_DISTRICT,
} from "@/lib/fed-districts";
import {
  getDisplayName,
  isFeaturedFee,
  getFeeFamily,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

export async function generateStaticParams() {
  return Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1) }));
}

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const districtId = parseInt(id, 10);
  const name = DISTRICT_NAMES[districtId];
  if (!name) return { title: "District Not Found" };

  return {
    title: `Fed District ${districtId} - ${name}: Banking Fee Benchmarks | Bank Fee Index`,
    description: `Banking fee benchmarks, Beige Book economic context, and institution data for Federal Reserve District ${districtId} (${name}).`,
    alternates: { canonical: `/districts/${districtId}` },
  };
}

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const districtId = parseInt(id, 10);
  const districtName = DISTRICT_NAMES[districtId];

  if (!districtName || districtId < 1 || districtId > 12) {
    notFound();
  }

  // Data queries
  const feeIndex = getPeerIndex({ fed_districts: [districtId] });
  const featuredFees = feeIndex
    .filter((e) => isFeaturedFee(e.fee_category))
    .sort((a, b) => b.institution_count - a.institution_count);

  const beigeBook = getLatestBeigeBook(districtId);
  const summarySection = beigeBook.find(
    (s) => s.section_name === "Summary of Economic Activity"
  );

  const fedContent = getDistrictContent(districtId, 5);
  const indicators = getDistrictIndicators(districtId);

  // States in this district
  const districtStates = Object.entries(STATE_TO_DISTRICT)
    .filter(([, d]) => d === districtId)
    .map(([code]) => ({ code, name: STATE_NAMES[code] ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalInstitutions = featuredFees.reduce(
    (max, e) => Math.max(max, e.institution_count),
    0
  );

  // Latest FRED indicators (most recent observation per series)
  const latestIndicators = new Map<string, { value: number | null; units: string | null; title: string | null }>();
  for (const ind of indicators) {
    if (!latestIndicators.has(ind.series_id)) {
      latestIndicators.set(ind.series_id, {
        value: ind.value,
        units: ind.units,
        title: ind.series_title,
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Districts", href: "/districts" },
          { name: districtName, href: `/districts/${districtId}` },
        ]}
      />
      {/* Breadcrumb */}
      <nav className="mb-6 text-[13px] text-slate-400">
        <Link
          href="/districts"
          className="hover:text-slate-600 transition-colors"
        >
          Districts
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">
          {districtId} - {districtName}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          District {districtId} - {districtName}
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Banking fee benchmarks and economic context for{" "}
          {districtStates.map((s) => s.name).join(", ")}.
        </p>
      </div>

      {/* Beige Book Summary */}
      {summarySection && (
        <section className="mb-10 rounded-lg border border-slate-200 bg-amber-50/30 p-6">
          <h2 className="mb-3 text-sm font-bold text-amber-800">
            Beige Book - Economic Summary
          </h2>
          <p className="text-[13px] leading-relaxed text-slate-700">
            {summarySection.content_text.length > 600
              ? summarySection.content_text.slice(0, 597) + "..."
              : summarySection.content_text}
          </p>
          <p className="mt-2 text-[11px] text-slate-400">
            Source: Federal Reserve Beige Book, {summarySection.release_date}
          </p>
        </section>
      )}

      {/* Fee Index for this district */}
      {featuredFees.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Featured Fee Benchmarks
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee Category
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    P25 - P75
                  </th>
                  <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                    Institutions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featuredFees.map((e) => (
                  <tr
                    key={e.fee_category}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/fees/${e.fee_category}`}
                        className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {getDisplayName(e.fee_category)}
                      </Link>
                      <span className="ml-2 text-[10px] text-slate-400">
                        {getFeeFamily(e.fee_category)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-700">
                      {formatAmount(e.median_amount)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
                      {e.p25_amount != null && e.p75_amount != null
                        ? `${formatAmount(e.p25_amount)} - ${formatAmount(e.p75_amount)}`
                        : "-"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-sm tabular-nums text-slate-500 md:table-cell">
                      {e.institution_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Economic Indicators */}
        {latestIndicators.size > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
              Economic Indicators
            </h2>
            <div className="space-y-3">
              {Array.from(latestIndicators.entries()).map(
                ([seriesId, data]) => (
                  <div
                    key={seriesId}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {data.title ?? seriesId}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-slate-900">
                      {data.value != null ? data.value.toFixed(2) : "-"}
                      {data.units === "Percent" && "%"}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* Fed Speeches */}
        {fedContent.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
              Recent Fed Activity
            </h2>
            <div className="space-y-3">
              {fedContent.map((item) => (
                <a
                  key={item.id}
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-slate-200 px-4 py-3 hover:border-blue-200 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {item.speaker && <span>{item.speaker} &middot; </span>}
                    {item.content_type} &middot; {item.published_at}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* States in district */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
          States in District {districtId}
        </h2>
        <div className="flex flex-wrap gap-2">
          {districtStates.map((s) => (
            <span
              key={s.code}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600"
            >
              {s.name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

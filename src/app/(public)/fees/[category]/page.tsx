import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategoryIndex,
  getPeerIndex,
  getDistrictMedianByCategory,
} from "@/lib/crawler-db";
import {
  FEE_FAMILIES,
  getDisplayName,
  getFeeFamily,
  getFeaturedCategories,
  getFeeTier,
  FAMILY_COLORS,
  TAXONOMY_COUNT,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, STATE_TO_DISTRICT, STATE_NAMES } from "@/lib/fed-districts";
import { formatAmount } from "@/lib/format";
import { DataFreshness } from "@/components/data-freshness";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DistributionChart } from "@/components/distribution-chart";
import { GlossaryTerm } from "@/components/glossary-tooltip";

const ALL_CATEGORIES = new Set(Object.values(FEE_FAMILIES).flat());

export async function generateStaticParams() {
  return getFeaturedCategories().map((cat) => ({ category: cat }));
}

export const dynamicParams = true;
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const displayName = getDisplayName(category);
  const entry = getCategoryIndex(category);
  const median = entry?.median_amount;

  return {
    title: `${displayName} Fees: 2026 National Benchmark | Bank Fee Index`,
    description: `National median ${displayName.toLowerCase()} fee is ${median != null ? `$${median.toFixed(2)}` : "unavailable"}. Compare across ${entry?.institution_count ?? 0} U.S. banks and credit unions by charter type, asset size, and Fed district.`,
    alternates: { canonical: `/fees/${category}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!ALL_CATEGORIES.has(category)) notFound();
  const displayName = getDisplayName(category);
  const family = getFeeFamily(category);
  const tier = getFeeTier(category);
  const familyColor = family ? FAMILY_COLORS[family] : null;

  const entry = getCategoryIndex(category);

  // Charter comparison
  const bankIndex = getPeerIndex({ charter_type: "bank" });
  const cuIndex = getPeerIndex({ charter_type: "credit_union" });
  const bankEntry = bankIndex.find((e) => e.fee_category === category);
  const cuEntry = cuIndex.find((e) => e.fee_category === category);

  // District breakdown
  const districtData = getDistrictMedianByCategory(category);

  // States with data for this category (for the state links section)
  const statesInCategory = new Set<string>();
  for (const [state] of Object.entries(STATE_TO_DISTRICT)) {
    statesInCategory.add(state);
  }

  // All categories in same family (for related links)
  const familyCategories = family
    ? (FEE_FAMILIES[family] ?? []).filter((c) => c !== category)
    : [];

  if (!entry) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">
          {displayName}
        </h1>
        <p className="mt-4 text-slate-500">
          No fee data available for this category yet.
        </p>
        <Link
          href="/fees"
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          View all fee categories
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: displayName, href: `/fees/${category}` },
        ]}
      />
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-slate-400">
        <Link href="/fees" className="hover:text-slate-600 transition-colors">
          Fee Index
        </Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <span className="text-slate-600" aria-current="page">{displayName}</span>
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
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {tier}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {displayName}
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          National benchmark data from{" "}
          {entry.institution_count.toLocaleString()} institutions.
        </p>
        <DataFreshness />
      </div>

      {/* Hero stats */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label={<GlossaryTerm term="median">National Median</GlossaryTerm>}
          value={formatAmount(entry.median_amount)}
          highlight
        />
        <StatCard
          label={<GlossaryTerm term="iqr">P25 - P75 Range</GlossaryTerm>}
          value={
            entry.p25_amount != null && entry.p75_amount != null
              ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
              : "-"
          }
        />
        <StatCard
          label="Min / Max"
          value={
            entry.min_amount != null && entry.max_amount != null
              ? `${formatAmount(entry.min_amount)} - ${formatAmount(entry.max_amount)}`
              : "-"
          }
        />
        <StatCard
          label="Institutions"
          value={entry.institution_count.toLocaleString()}
        />
      </div>

      {/* Distribution visualization */}
      <div className="mb-10">
        <DistributionChart
          min={entry.min_amount}
          p25={entry.p25_amount}
          median={entry.median_amount}
          p75={entry.p75_amount}
          max={entry.max_amount}
        />
      </div>

      {/* Charter comparison */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
          Banks vs Credit Unions
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left">
            <caption className="sr-only">
              {displayName} fee comparison: banks vs credit unions
            </caption>
            <thead>
              <tr className="bg-slate-50/80">
                <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Charter
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Median
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  P25 - P75
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Institutions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <CharterRow label="Banks" entry={bankEntry} />
              <CharterRow label="Credit Unions" entry={cuEntry} />
              <CharterRow label="All Institutions" entry={entry} bold />
            </tbody>
          </table>
        </div>
      </section>

      {/* District breakdown */}
      {districtData.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            By <GlossaryTerm term="fed district">Fed District</GlossaryTerm>
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <caption className="sr-only">
                {displayName} fee by Federal Reserve district
              </caption>
              <thead>
                <tr className="bg-slate-50/80">
                  <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    District
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    vs National
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Institutions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {districtData.map((d) => {
                  const natMedian = entry.median_amount;
                  const delta =
                    d.median_amount != null && natMedian != null && natMedian > 0
                      ? ((d.median_amount - natMedian) / natMedian) * 100
                      : null;
                  return (
                    <tr
                      key={d.district}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/districts/${d.district}`}
                          className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {d.district} - {DISTRICT_NAMES[d.district]}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-700">
                        {formatAmount(d.median_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {delta != null && (
                          <DeltaPill delta={delta} />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">
                        {d.institution_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Browse by state */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
          Browse by State
        </h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATE_NAMES)
            .filter(([code]) => code.length === 2 && STATE_TO_DISTRICT[code])
            .sort(([, a], [, b]) => a.localeCompare(b))
            .map(([code, name]) => (
              <Link
                key={code}
                href={`/fees/${category}/by-state/${code.toLowerCase()}`}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {name}
              </Link>
            ))}
        </div>
      </section>

      {/* Related categories */}
      {familyCategories.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Related Fees in {family}
          </h2>
          <div className="flex flex-wrap gap-2">
            {familyCategories.map((cat) => (
              <Link
                key={cat}
                href={`/fees/${cat}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {getDisplayName(cat)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Methodology */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-6">
        <h2 className="mb-2 text-sm font-bold text-slate-700">Methodology</h2>
        <p className="text-[13px] leading-relaxed text-slate-500">
          Fee data is sourced from publicly available fee schedule documents
          collected from U.S. banks and credit unions. Statistics are computed
          from {entry.observation_count.toLocaleString()} observations across{" "}
          {entry.institution_count.toLocaleString()} institutions. Data includes
          pending, staged, and approved fee extractions. This analysis may not be
          representative of the full market.
        </p>
        <p className="mt-3 text-[13px] text-slate-500">
          See an error?{" "}
          <a
            href={`mailto:data@bankfeeindex.com?subject=Data correction: ${displayName}&body=Fee category: ${displayName} (${category})%0A%0AInstitution:%0ACurrent amount shown:%0ACorrect amount:%0ASource URL:`}
            className="text-blue-600 hover:underline"
          >
            Report a data correction
          </a>{" "}
          or{" "}
          <Link href="/about#data-corrections" className="text-blue-600 hover:underline">
            learn about our correction process
          </Link>.
        </p>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: `U.S. ${displayName} Fee Data: 2026`,
            description: `National benchmark data for ${displayName.toLowerCase()} fees across ${entry.institution_count.toLocaleString()} U.S. banks and credit unions`,
            creator: {
              "@type": "Organization",
              name: "Bank Fee Index",
            },
            temporalCoverage: "2024/2026",
            spatialCoverage: {
              "@type": "Place",
              name: "United States",
            },
            variableMeasured: displayName,
            measurementTechnique:
              "Automated extraction from publicly available fee schedule documents",
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: React.ReactNode;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${highlight ? "text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </p>
    </div>
  );
}

function CharterRow({
  label,
  entry,
  bold,
}: {
  label: string;
  entry: { median_amount: number | null; p25_amount: number | null; p75_amount: number | null; institution_count: number } | undefined;
  bold?: boolean;
}) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td
        className={`px-4 py-2.5 text-sm ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}
      >
        {label}
      </td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-700">
        {entry ? formatAmount(entry.median_amount) : "-"}
      </td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">
        {entry?.p25_amount != null && entry?.p75_amount != null
          ? `${formatAmount(entry.p25_amount)} - ${formatAmount(entry.p75_amount)}`
          : "-"}
      </td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">
        {entry?.institution_count?.toLocaleString() ?? "-"}
      </td>
    </tr>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const isBelow = delta < 0;
  const colorClass = isBelow
    ? "bg-emerald-50 text-emerald-600"
    : delta > 0
      ? "bg-red-50 text-red-600"
      : "bg-slate-100 text-slate-500";
  const label = isBelow ? "below" : delta > 0 ? "above" : "at";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${colorClass}`}
      title={`${Math.abs(delta).toFixed(1)}% ${label} national median`}
    >
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

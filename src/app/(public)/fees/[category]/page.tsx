import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFeeCategorySummaries,
  getFeeCategoryDetail,
  getDataFreshness,
} from "@/lib/crawler-db";
import { computeStats } from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  getFamilyColor,
  getFeeTier,
  FEE_FAMILIES,
  DISPLAY_NAMES,
} from "@/lib/fee-taxonomy";
import { DISTRICT_NAMES, TIER_LABELS } from "@/lib/fed-districts";
import { formatAmount, formatAssets } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataFreshness } from "@/components/data-freshness";
import { DistributionChart } from "@/components/public/distribution-chart";
import { STATE_NAMES } from "@/lib/us-states";
import { SITE_URL } from "@/lib/constants";

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const name = getDisplayName(category);
  const family = getFeeFamily(category);

  return {
    title: `${name} Fee - National Benchmarks & Analysis`,
    description: `National benchmarking data for ${name.toLowerCase()} fees. See median, P25/P75, distribution, and breakdowns by bank vs. credit union, asset tier, Fed district, and state.`,
    openGraph: {
      title: `${name} Fee Benchmarks | Fee Insight`,
      description: `How much do banks charge for ${name.toLowerCase()}? National median, distribution, and peer comparisons.`,
    },
    keywords: [
      `${name.toLowerCase()} fee`,
      `average ${name.toLowerCase()} fee`,
      `bank ${name.toLowerCase()} fee`,
      family ? `${family.toLowerCase()} fees` : "bank fees",
    ],
  };
}

export async function generateStaticParams() {
  return Object.keys(DISPLAY_NAMES).map((category) => ({ category }));
}

export default async function FeeCategoryPage({ params }: PageProps) {
  const { category } = await params;

  if (!DISPLAY_NAMES[category]) {
    notFound();
  }

  const name = getDisplayName(category);
  const family = getFeeFamily(category);
  const familyColor = family ? getFamilyColor(family) : null;
  const tier = getFeeTier(category);
  const detail = getFeeCategoryDetail(category);
  const freshness = getDataFreshness();

  // Compute overall stats from fee amounts
  const amounts = detail.fees
    .filter((f) => f.amount !== null && f.amount > 0)
    .map((f) => f.amount!);
  const stats = computeStats(amounts);

  // Related fees in same family
  const familyMembers = family
    ? (FEE_FAMILIES[family] ?? []).filter((c) => c !== category)
    : [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
          { name: name, href: `/fees/${category}` },
        ]}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/fees" className="hover:text-slate-600 transition-colors">
          Fee Index
        </Link>
        <span>/</span>
        <span className="text-slate-600">{name}</span>
      </nav>

      {/* Header */}
      <div className="mt-4 flex items-start gap-3">
        {family && familyColor && (
          <span
            className={`mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${familyColor.bg} ${familyColor.text}`}
          >
            {family}
          </span>
        )}
        <span className="mt-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {tier}
        </span>
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {name} Fee
      </h1>
      <p className="mt-1 text-[14px] text-slate-600">
        National benchmarking data based on {amounts.length.toLocaleString()}{" "}
        observations from {detail.fees.length.toLocaleString()} institutions.
      </p>
      <div className="mt-1">
        <DataFreshness />
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Median", value: formatAmount(stats.median) },
          { label: "25th Percentile", value: formatAmount(stats.p25) },
          { label: "75th Percentile", value: formatAmount(stats.p75) },
          {
            label: "Range",
            value: `${formatAmount(stats.min)} - ${formatAmount(stats.max)}`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-slate-200 p-3.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {s.label}
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Distribution */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-slate-800">
          Fee Distribution
        </h2>
        <div className="mt-3 rounded-lg border border-slate-200 p-4">
          <DistributionChart
            amounts={amounts}
            median={stats.median}
          />
        </div>
      </section>

      {/* Bank vs CU */}
      {detail.by_charter_type.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Bank vs. Credit Union
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Type
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Range
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.by_charter_type.map((row) => (
                  <tr
                    key={row.dimension_value}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {row.dimension_value}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(row.median_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {formatAmount(row.min_amount)} &ndash;{" "}
                      {formatAmount(row.max_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Asset tier breakdown */}
      {detail.by_asset_tier.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            By Asset Tier
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Tier
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Range
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.by_asset_tier.map((row) => (
                  <tr
                    key={row.dimension_value}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {TIER_LABELS[row.dimension_value] ?? row.dimension_value}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(row.median_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {formatAmount(row.min_amount)} &ndash;{" "}
                      {formatAmount(row.max_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Fed district breakdown */}
      {detail.by_fed_district.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            By Federal Reserve District
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    District
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Range
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.by_fed_district.map((row) => {
                  const distNum = parseInt(
                    row.dimension_value.replace("District ", "")
                  );
                  const distName =
                    DISTRICT_NAMES[distNum] ?? row.dimension_value;
                  return (
                    <tr
                      key={row.dimension_value}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {distName}{" "}
                        <span className="text-slate-400">
                          ({row.dimension_value})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                        {formatAmount(row.median_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {formatAmount(row.min_amount)} &ndash;{" "}
                        {formatAmount(row.max_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* State breakdown (top 15) */}
      {detail.by_state.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            By State
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              Top {detail.by_state.length} by observation count
            </span>
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    State
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Avg
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.by_state.map((row) => (
                  <tr
                    key={row.dimension_value}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {STATE_NAMES[row.dimension_value] ?? row.dimension_value}
                      <span className="ml-1.5 text-slate-400">
                        ({row.dimension_value})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(row.median_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {formatAmount(row.avg_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Related fees */}
      {familyMembers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">
            Related Fees in {family}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {familyMembers.map((cat) => (
              <Link
                key={cat}
                href={`/fees/${cat}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors"
              >
                {getDisplayName(cat)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Methodology note */}
      <section className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Methodology
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Data sourced from published fee schedules of {detail.fees.length.toLocaleString()}{" "}
          US banks and credit unions. Fees are extracted using automated
          parsing with confidence scoring and human review. Statistics include
          all non-rejected observations. Institutions are identified via FDIC
          and NCUA regulatory databases.
        </p>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${name} Fee - National Benchmarks`,
            description: `National ${name.toLowerCase()} fee: median ${formatAmount(stats.median)}, based on ${amounts.length} observations.`,
            url: `${SITE_URL}/fees/${category}`,
            dateModified: freshness.last_crawl_at ?? undefined,
            publisher: {
              "@type": "Organization",
              name: "Fee Insight",
              url: SITE_URL,
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

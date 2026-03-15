import type { Metadata } from "next";
import Link from "next/link";
import {
  getFeeCategorySummaries,
  getStats,
  getDataFreshness,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  getFeeTier,
  FEE_FAMILIES,
  FAMILY_COLORS,
  TAXONOMY_COUNT,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Fee Index - All 49 Bank Fee Categories",
  description:
    "Compare bank and credit union fees across 49 categories. National medians, ranges, and institution counts for overdraft, NSF, ATM, wire transfer, and more.",
};

const TIER_LABELS: Record<string, string> = {
  spotlight: "Spotlight",
  core: "Core",
  extended: "Extended",
  comprehensive: "Comprehensive",
};

export default function FeeCatalogPage() {
  const summaries = getFeeCategorySummaries();
  const stats = getStats();
  const freshness = getDataFreshness();

  const byFamily = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const family = getFeeFamily(s.fee_category) ?? "Other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(s);
  }

  const familyOrder = Object.keys(FEE_FAMILIES);

  // Compute global range for the range bar visualization
  const allMaxAmounts = summaries
    .map((s) => s.max_amount)
    .filter((a): a is number => a !== null && a > 0);
  const globalMax = allMaxAmounts.length > 0 ? Math.max(...allMaxAmounts) : 100;

  // Spotlight stats for hero
  const spotlightCategories = ["overdraft", "nsf", "monthly_maintenance", "atm_non_network"];
  const spotlightFees = spotlightCategories
    .map((c) => summaries.find((s) => s.fee_category === c))
    .filter(Boolean) as typeof summaries;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
        ]}
      />

      {/* ── HERO ── */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Fee Index
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Bank & Credit Union Fee Benchmarks
      </h1>

      {/* Authority strip */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
        <span>
          <span className="font-semibold text-slate-700 tabular-nums">
            {freshness.total_observations.toLocaleString()}
          </span>{" "}
          fee observations across{" "}
          <span className="font-semibold text-slate-700 tabular-nums">
            {stats.total_institutions.toLocaleString()}
          </span>{" "}
          institutions
        </span>
        <span className="text-slate-300">|</span>
        <span>
          {TAXONOMY_COUNT} fee categories
        </span>
        <span className="text-slate-300">|</span>
        {freshness.last_crawl_at && (
          <span>
            Updated{" "}
            {new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Data source strip */}
      <div className="mt-1.5 text-[11px] text-slate-400">
        Sources: published fee schedules, FDIC Call Reports, NCUA 5300 Reports, institution websites
      </div>

      {/* ── SPOTLIGHT STAT CARDS ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {spotlightFees.map((fee) => (
          <Link
            key={fee.fee_category}
            href={`/fees/${fee.fee_category}`}
            className="group rounded-lg border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-blue-200 hover:shadow-sm"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-500 transition-colors">
              {getDisplayName(fee.fee_category)}
            </p>
            <p className="mt-1 text-2xl tabular-nums font-extrabold text-slate-900">
              {formatAmount(fee.median_amount)}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
              {formatAmount(fee.min_amount)} &ndash; {formatAmount(fee.max_amount)}
              <span className="ml-1.5">{fee.institution_count.toLocaleString()} inst.</span>
            </p>
          </Link>
        ))}
      </div>

      {/* ── ACTION BAR ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href="/research/national-fee-index"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          National Fee Index
        </Link>
        <Link
          href="/research"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          State &amp; district reports
        </Link>
        <Link
          href="/guides"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          Consumer guides
        </Link>
        <Link
          href="/api-docs"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          API
        </Link>
      </div>

      {/* ── MAIN + SIDEBAR ── */}
      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[1fr_280px]">
        {/* Main: Fee families */}
        <div className="space-y-8">
          {familyOrder.map((familyName) => {
            const cats = byFamily.get(familyName);
            if (!cats || cats.length === 0) return null;
            const colors = FAMILY_COLORS[familyName];
            const colorBg = colors?.border?.replace("border-l-", "bg-") ?? "bg-slate-400";

            // Section summary stats
            const sectionMedians = cats
              .map((c) => c.median_amount)
              .filter((a) => a !== null) as number[];
            const sectionAvgMedian =
              sectionMedians.length > 0
                ? sectionMedians.reduce((a, b) => a + b, 0) / sectionMedians.length
                : null;
            const sectionMaxMedian =
              sectionMedians.length > 0 ? Math.max(...sectionMedians) : null;

            const sectionId = familyName.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and");

            return (
              <section key={familyName} id={sectionId}>
                {/* Section header with stats */}
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className={`flex items-center gap-2 text-sm font-bold ${colors?.text ?? "text-slate-700"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-1.5 rounded-full ${colorBg}`}
                    />
                    {familyName}
                    <span className="ml-1 text-[11px] font-medium text-slate-400">
                      ({cats.length})
                    </span>
                  </h2>
                  {sectionAvgMedian !== null && (
                    <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-400">
                      <span>
                        Avg median:{" "}
                        <span className="font-semibold text-slate-600 tabular-nums">
                          {formatAmount(sectionAvgMedian)}
                        </span>
                      </span>
                      <span>
                        Highest:{" "}
                        <span className="font-semibold text-slate-600 tabular-nums">
                          {formatAmount(sectionMaxMedian)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Fee
                        </th>
                        <th scope="col" className="hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">
                          Tier
                        </th>
                        <th scope="col" className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Median
                        </th>
                        <th scope="col" className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                          P25
                        </th>
                        <th scope="col" className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                          P75
                        </th>
                        <th scope="col" className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                          Range
                        </th>
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Distribution
                        </th>
                        <th scope="col" className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Inst.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cats.map((cat) => {
                        const tier = getFeeTier(cat.fee_category);
                        // Range bar: visualize P25-P75 within global max
                        const barMin = cat.min_amount ?? 0;
                        const barP25 = cat.p25_amount ?? barMin;
                        const barP75 = cat.p75_amount ?? cat.max_amount ?? 0;
                        const barMax = cat.max_amount ?? 0;
                        const barLeftPct = (barP25 / globalMax) * 100;
                        const barWidthPct = Math.max(
                          ((barP75 - barP25) / globalMax) * 100,
                          1
                        );
                        const medianPct = cat.median_amount
                          ? (cat.median_amount / globalMax) * 100
                          : 0;

                        return (
                          <tr
                            key={cat.fee_category}
                            className="group hover:bg-blue-50/30 transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <Link
                                href={`/fees/${cat.fee_category}`}
                                className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors"
                              >
                                {getDisplayName(cat.fee_category)}
                              </Link>
                            </td>
                            <td className="hidden px-4 py-2.5 lg:table-cell">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {TIER_LABELS[tier]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                              {formatAmount(cat.median_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                              {formatAmount(cat.p25_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                              {formatAmount(cat.p75_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-400 text-[12px] md:table-cell">
                              {formatAmount(barMin)} &ndash;{" "}
                              {formatAmount(barMax)}
                            </td>
                            {/* Inline range bar */}
                            <td className="px-4 py-2.5">
                              <div className="relative h-3 w-full min-w-[80px] rounded-full bg-slate-100">
                                {/* P25-P75 range */}
                                <div
                                  className="absolute top-0 h-3 rounded-full bg-slate-300/70 group-hover:bg-blue-300/70 transition-colors"
                                  style={{
                                    left: `${Math.min(barLeftPct, 95)}%`,
                                    width: `${Math.min(barWidthPct, 100 - barLeftPct)}%`,
                                  }}
                                />
                                {/* Median marker */}
                                {cat.median_amount !== null && (
                                  <div
                                    className="absolute top-0 h-3 w-0.5 rounded-full bg-slate-700 group-hover:bg-blue-700 transition-colors"
                                    style={{
                                      left: `${Math.min(medianPct, 98)}%`,
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                              {cat.institution_count.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        {/* ── SIDEBAR ── */}
        <aside className="hidden xl:block space-y-5 sticky top-20 self-start">
          {/* Quick jump */}
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Jump to Family
            </p>
            <nav className="mt-3 space-y-1">
              {familyOrder.map((familyName) => {
                const cats = byFamily.get(familyName);
                if (!cats || cats.length === 0) return null;
                const colors = FAMILY_COLORS[familyName];
                const colorBg = colors?.border?.replace("border-l-", "bg-") ?? "bg-slate-400";

                return (
                  <a
                    key={familyName}
                    href={`#${familyName.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${colorBg}`}
                    />
                    {familyName}
                    <span className="ml-auto text-[11px] text-slate-300">
                      {cats.length}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Key benchmarks */}
          <div className="rounded-lg border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Key Benchmarks
            </p>
            <div className="mt-3 space-y-3">
              {spotlightFees.slice(0, 6).map((fee) => (
                <Link
                  key={fee.fee_category}
                  href={`/fees/${fee.fee_category}`}
                  className="block group"
                >
                  <span className="text-[11px] text-slate-500 group-hover:text-blue-600 transition-colors">
                    {getDisplayName(fee.fee_category)}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-lg tabular-nums font-extrabold text-slate-900">
                      {formatAmount(fee.median_amount)}
                    </span>
                    <span className="text-[10px] text-slate-400">median</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Go Deeper
            </p>
            <div className="mt-3 space-y-2">
              <Link
                href="/research/national-fee-index"
                className="block text-[13px] text-slate-600 hover:text-blue-600 transition-colors"
              >
                Full national index
              </Link>
              <Link
                href="/research"
                className="block text-[13px] text-slate-600 hover:text-blue-600 transition-colors"
              >
                State &amp; district reports
              </Link>
              <Link
                href="/guides"
                className="block text-[13px] text-slate-600 hover:text-blue-600 transition-colors"
              >
                Consumer guides
              </Link>
              <Link
                href="/api-docs"
                className="block text-[13px] text-slate-600 hover:text-blue-600 transition-colors"
              >
                API documentation
              </Link>
            </div>
          </div>

          {/* Data credibility */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Data Sources
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-500">
              <li>Published fee schedules</li>
              <li>FDIC Call Reports</li>
              <li>NCUA 5300 Reports</li>
              <li>Institution websites</li>
            </ul>
            <div className="mt-3 border-t border-slate-200 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Coverage
              </p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-slate-500">
                <li>Banks + Credit Unions</li>
                <li>All asset tiers</li>
                <li>All 12 Fed districts</li>
                <li>50 states</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Fee Insight - Complete Fee Catalog",
            description:
              "National benchmarking data across 49 bank and credit union fee categories.",
            url: `${SITE_URL}/fees`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

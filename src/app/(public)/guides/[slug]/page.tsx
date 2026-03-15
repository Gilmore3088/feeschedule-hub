import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/lib/guides";
import {
  getFeeCategorySummaries,
  getFeeCategoryDetail,
  getDataFreshness,
  getStats,
} from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DistributionChart } from "@/components/public/distribution-chart";
import { SITE_URL } from "@/lib/constants";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide Not Found" };

  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.feeCategories.map((c) => `${getDisplayName(c)} guide`),
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const allSummaries = getFeeCategorySummaries();
  const relevantFees = allSummaries.filter((s) =>
    guide.feeCategories.includes(s.fee_category)
  );

  const freshness = getDataFreshness();
  const stats = getStats();

  // Get detailed fee data for the primary category (first in list) for charts
  const primaryCategory = guide.feeCategories[0];
  const primaryDetail = getFeeCategoryDetail(primaryCategory);
  const primaryAmounts = primaryDetail.fees
    .map((f) => f.amount)
    .filter((a): a is number => a !== null && a > 0);
  const primarySummary = relevantFees.find(
    (f) => f.fee_category === primaryCategory
  );

  // Get cheapest and most expensive for primary category
  const sortedFees = primaryDetail.fees
    .filter((f) => f.amount !== null && f.amount >= 0)
    .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
  const cheapest = sortedFees.slice(0, 5);
  const mostExpensive = sortedFees.slice(-5).reverse();
  const zeroFeeCount = sortedFees.filter((f) => f.amount === 0).length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
          { name: guide.title.split(":")[0], href: `/guides/${slug}` },
        ]}
      />

      {/* ── HERO: Title + one-liner ── */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Consumer Guide
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        {guide.title.split(":")[0]}
      </h1>
      <p className="mt-2 max-w-3xl text-[15px] text-slate-600">
        {guide.description}
      </p>

      {/* ── Authority strip ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>
          Data from{" "}
          <span className="font-semibold text-slate-600">
            {stats.total_institutions.toLocaleString()}
          </span>{" "}
          US banks and credit unions
        </span>
        <span className="hidden sm:inline">|</span>
        {freshness.last_crawl_at && (
          <span>
            Updated{" "}
            <span className="font-semibold text-slate-600">
              {new Date(freshness.last_crawl_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </span>
        )}
        <span className="hidden sm:inline">|</span>
        <span>Sources: fee schedules, disclosures, call reports</span>
      </div>

      {/* ── LIVE DATA STRIP (full width, data-first) ── */}
      {relevantFees.length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/60">
          <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4 divide-slate-200">
            {relevantFees.slice(0, 4).map((fee) => (
              <Link
                key={fee.fee_category}
                href={`/fees/${fee.fee_category}`}
                className="group px-5 py-4 transition-colors hover:bg-white"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">
                  {getDisplayName(fee.fee_category)}
                </p>
                <p className="mt-1 text-2xl tabular-nums font-extrabold text-slate-900">
                  {formatAmount(fee.median_amount)}
                  <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                    median
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] tabular-nums text-slate-500">
                  {formatAmount(fee.min_amount)} &ndash;{" "}
                  {formatAmount(fee.max_amount)} range
                  <span className="mx-1.5 text-slate-300">|</span>
                  {fee.institution_count.toLocaleString()} institutions
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          View full fee index
        </Link>
        {relevantFees[0] && (
          <Link
            href={`/fees/${relevantFees[0].fee_category}`}
            className="rounded-md border border-blue-200 bg-blue-50/40 px-3.5 py-1.5 text-[13px] font-medium text-blue-700 transition-colors hover:bg-blue-100/50"
          >
            View {getDisplayName(relevantFees[0].fee_category)} analysis
          </Link>
        )}
        <Link
          href="/research"
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-700"
        >
          Research reports
        </Link>
      </div>

      {/* ── MAIN CONTENT + SIDEBAR ── */}
      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div>
          {/* ── DISTRIBUTION CHART ── */}
          {primaryAmounts.length >= 5 && primarySummary && (
            <section className="mb-10">
              <h2 className="text-base font-bold text-slate-900">
                {getDisplayName(primaryCategory)} Fee Distribution
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                How {primaryAmounts.length.toLocaleString()} institutions price
                this fee. National median:{" "}
                <span className="font-semibold text-slate-700">
                  {formatAmount(primarySummary.median_amount)}
                </span>
              </p>
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <DistributionChart
                  amounts={primaryAmounts}
                  median={primarySummary.median_amount}
                  bucketCount={16}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Link
                  href={`/fees/${primaryCategory}`}
                  className="text-[12px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Full analysis with breakdowns &rarr;
                </Link>
              </div>
            </section>
          )}

          {/* ── GUIDE SECTIONS (prose style, full width) ── */}
          <div className="prose prose-slate max-w-none">
            {guide.sections.map((section, i) => (
              <section
                key={i}
                id={`section-${i}`}
                className="mb-8 scroll-mt-20"
              >
                <h2 className="text-lg font-bold tracking-tight text-slate-900 mb-2">
                  {section.heading}
                </h2>
                <p className="text-[15px] leading-[1.8] text-slate-600">
                  {section.content}
                </p>
              </section>
            ))}
          </div>

          {/* ── EXPLORE THE DATA (specific hooks) ── */}
          <section className="mt-10">
            <h2 className="text-base font-bold text-slate-900">
              Explore the Data
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Drill into the numbers behind this guide.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {relevantFees.map((fee) => (
                <Link
                  key={`deep-${fee.fee_category}`}
                  href={`/fees/${fee.fee_category}`}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                      {getDisplayName(fee.fee_category)} Deep Dive
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Distribution, breakdowns by charter, state, tier
                    </span>
                  </div>
                </Link>
              ))}
              <Link
                href="/research/national-fee-index"
                className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                    National Fee Index
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    All 49 fee categories benchmarked
                  </span>
                </div>
              </Link>
              <Link
                href="/research"
                className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                    State & District Reports
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Fee analysis by geography
                  </span>
                </div>
              </Link>
            </div>
          </section>

          {/* ── MORE GUIDES ── */}
          <section className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-base font-bold text-slate-900">
              More Guides
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {GUIDES.filter((g) => g.slug !== slug).map((g) => (
                <Link
                  key={g.slug}
                  href={`/guides/${g.slug}`}
                  className="group rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:shadow-sm"
                >
                  <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                    {g.title.split(":")[0]}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-slate-500 line-clamp-2">
                    {g.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ── SIDEBAR ── */}
        <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          {/* Live benchmarks (expanded) */}
          {relevantFees.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white px-5 py-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Live National Benchmarks
              </p>
              <div className="mt-4 space-y-4">
                {relevantFees.map((fee) => (
                  <div
                    key={fee.fee_category}
                    className="border-b border-blue-100 pb-3 last:border-0 last:pb-0"
                  >
                    <Link
                      href={`/fees/${fee.fee_category}`}
                      className="text-[13px] font-semibold text-blue-900 hover:text-blue-600 transition-colors"
                    >
                      {getDisplayName(fee.fee_category)}
                    </Link>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-xl tabular-nums font-extrabold text-blue-900">
                        {formatAmount(fee.median_amount)}
                      </span>
                      <span className="text-[11px] text-blue-500">median</span>
                    </div>
                    <div className="mt-1 text-[11px] text-blue-600/70">
                      <span className="tabular-nums">
                        P25: {formatAmount(fee.p25_amount)} | P75:{" "}
                        {formatAmount(fee.p75_amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <Link
                        href={`/fees/${fee.fee_category}`}
                        className="rounded bg-blue-100/60 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200/60 transition-colors"
                      >
                        Distribution
                      </Link>
                      <Link
                        href={`/fees/${fee.fee_category}`}
                        className="rounded bg-blue-100/60 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200/60 transition-colors"
                      >
                        By state
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cheapest institutions */}
          {cheapest.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                Lowest {getDisplayName(primaryCategory)} Fees
              </p>
              {zeroFeeCount > 0 && (
                <p className="mt-1.5 text-[12px] font-medium text-emerald-700">
                  {zeroFeeCount} institution{zeroFeeCount !== 1 ? "s" : ""} charge{" "}
                  <span className="font-bold">$0</span>
                </p>
              )}
              <div className="mt-3 space-y-1.5">
                {cheapest.map((f, i) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="text-slate-600 truncate mr-2">
                      <span className="text-slate-400 tabular-nums mr-1">
                        {i + 1}.
                      </span>
                      {f.institution_name}
                    </span>
                    <span className="tabular-nums font-semibold text-emerald-700 shrink-0">
                      {formatAmount(f.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most expensive */}
          {mostExpensive.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/30 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                Highest {getDisplayName(primaryCategory)} Fees
              </p>
              <div className="mt-3 space-y-1.5">
                {mostExpensive.map((f, i) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="text-slate-600 truncate mr-2">
                      <span className="text-slate-400 tabular-nums mr-1">
                        {i + 1}.
                      </span>
                      {f.institution_name}
                    </span>
                    <span className="tabular-nums font-semibold text-red-700 shrink-0">
                      {formatAmount(f.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick nav */}
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              In This Guide
            </p>
            <nav className="mt-3 space-y-1.5">
              {guide.sections.map((section, i) => (
                <a
                  key={i}
                  href={`#section-${i}`}
                  className="block text-[13px] text-slate-600 hover:text-blue-600 transition-colors"
                >
                  {section.heading}
                </a>
              ))}
            </nav>
          </div>

          {/* CTA: Professional access */}
          <div className="rounded-lg border border-slate-300 bg-slate-900 px-5 py-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              For Professionals
            </p>
            <p className="mt-2 text-[14px] font-semibold text-white">
              Need deeper analysis?
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              API access, custom datasets, and research reports.
            </p>
            <Link
              href="/api-docs"
              className="mt-3 inline-block rounded-md bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-900 transition-colors hover:bg-slate-100"
            >
              View API docs
            </Link>
          </div>
        </aside>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            url: `${SITE_URL}/guides/${slug}`,
            mainEntity: {
              "@type": "FAQPage",
              mainEntity: guide.sections.map((s) => ({
                "@type": "Question",
                name: s.heading,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: s.content,
                },
              })),
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

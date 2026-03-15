import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import {
  getFeeCategorySummaries,
  getStats,
  getDataFreshness,
} from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Consumer Guides - Understanding Bank Fees",
  description:
    "Plain-language guides to understanding bank and credit union fees. Overdraft fees, NSF fees, ATM fees, wire transfers, and monthly maintenance fees explained with live data.",
};

const PRIMARY_SLUGS = new Set([
  "overdraft-fees",
  "nsf-fees",
  "atm-fees",
  "wire-transfer-fees",
  "monthly-maintenance-fees",
]);

export default function GuidesIndexPage() {
  const allSummaries = getFeeCategorySummaries();
  const stats = getStats();
  const freshness = getDataFreshness();

  const totalObservations = allSummaries.reduce(
    (a, s) => a + s.total_observations,
    0
  );
  const updateDate = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  const primaryGuides = GUIDES.filter((g) => PRIMARY_SLUGS.has(g.slug));
  const secondaryGuides = GUIDES.filter((g) => !PRIMARY_SLUGS.has(g.slug));

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
        ]}
      />

      {/* ── Hero ── */}
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Consumer Fee Guides
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-slate-500">
        Plain-language guides to understanding bank and credit union fees, backed by live benchmark data from {stats.total_institutions.toLocaleString()} institutions.
      </p>
      <p className="mt-2 text-[12px] tabular-nums text-slate-400">
        {totalObservations.toLocaleString()} fee observations
        {updateDate && (
          <>
            <span className="mx-2">&middot;</span>
            Updated {updateDate}
          </>
        )}
      </p>

      {/* ── Primary guides: card grid ── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {primaryGuides.map((guide) => {
          const relevantFees = allSummaries.filter((s) =>
            guide.feeCategories.includes(s.fee_category)
          );
          const topFee = relevantFees[0];

          return (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="group rounded-lg border border-slate-200 bg-white px-5 py-5 transition-all hover:border-blue-200 hover:shadow-md"
            >
              <h2 className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {guide.title.split(":")[0]}
              </h2>
              <p className="mt-1.5 text-[13px] text-slate-500 line-clamp-2">
                {guide.description}
              </p>

              {topFee && (
                <div className="mt-4 flex items-baseline gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xl font-extrabold tabular-nums text-slate-900">
                    {formatAmount(topFee.median_amount)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    national median
                  </span>
                </div>
              )}

              {relevantFees.length > 1 && (
                <div className="mt-2 space-y-1">
                  {relevantFees.slice(1, 4).map((fee) => (
                    <div
                      key={fee.fee_category}
                      className="flex items-center justify-between text-[12px]"
                    >
                      <span className="text-slate-500">
                        {getDisplayName(fee.fee_category)}
                      </span>
                      <span className="tabular-nums font-medium text-slate-700">
                        {formatAmount(fee.median_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 text-[12px] font-medium text-blue-600 group-hover:text-blue-700 transition-colors">
                Read guide &rarr;
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Secondary guides ── */}
      {secondaryGuides.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold text-slate-800">
            More Fee Guides
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {secondaryGuides.map((guide) => {
              const relevantFees = allSummaries.filter((s) =>
                guide.feeCategories.includes(s.fee_category)
              );
              const topFee = relevantFees[0];

              return (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-blue-200 hover:shadow-sm"
                >
                  <div>
                    <span className="text-[13px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {guide.title.split(":")[0]}
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">
                      {guide.description}
                    </p>
                  </div>
                  {topFee && (
                    <span className="ml-3 shrink-0 text-sm font-bold tabular-nums text-slate-700">
                      {formatAmount(topFee.median_amount)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Explore ── */}
      <div className="mt-12 rounded-lg border border-slate-200 bg-slate-50/50 px-6 py-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Explore More
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {[
            { label: "Fee Index", href: "/fees", desc: "All 49 categories" },
            { label: "National Benchmarks", href: "/research/national-fee-index", desc: "Medians & percentiles" },
            { label: "State Reports", href: "/research", desc: "Geographic analysis" },
            { label: "Fed Districts", href: "/research#districts", desc: "12 district reports" },
            { label: "Revenue Analysis", href: "/research/fee-revenue-analysis", desc: "Fee-to-income data" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group"
            >
              <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                {item.label}
              </span>
              <span className="ml-1 text-[11px] text-slate-400">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Consumer Guides - Understanding Bank Fees",
            description:
              "Plain-language guides to understanding bank and credit union fees.",
            url: `${SITE_URL}/guides`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

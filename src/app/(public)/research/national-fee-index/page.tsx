import type { Metadata } from "next";
import Link from "next/link";
import { getNationalIndex } from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeeFamily,
  FEE_FAMILIES,
  FAMILY_COLORS,
  isFeaturedFee,
  TAXONOMY_COUNT,
  FEATURED_COUNT,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { DataFreshness } from "@/components/data-freshness";
import { SITE_URL } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { canAccessAllCategories } from "@/lib/access";
import { UpgradeGate } from "@/components/upgrade-gate";

export const metadata: Metadata = {
  title: "National Fee Index - US Bank & Credit Union Fee Benchmarks",
  description:
    "The definitive national benchmark of bank and credit union fees across 49 categories. Median fees, percentiles, and institution counts from thousands of published fee schedules.",
  keywords: [
    "national fee index",
    "bank fee benchmarks",
    "average bank fees",
    "overdraft fee average",
    "NSF fee average",
    "credit union fees",
    "bank fee comparison",
  ],
};

export default async function NationalFeeIndexPage() {
  const user = await getCurrentUser();
  const showAll = canAccessAllCategories(user);
  const allIndex = getNationalIndex();
  const index = showAll ? allIndex : allIndex.filter((e) => isFeaturedFee(e.fee_category));
  const gatedCount = allIndex.length - index.length;

  // Group by family
  const byFamily = new Map<string, typeof index>();
  for (const entry of index) {
    const family = entry.fee_family ?? "Other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(entry);
  }

  const familyOrder = Object.keys(FEE_FAMILIES);

  // Summary stats
  const totalInstitutions = new Set(
    index.flatMap((e) => Array.from({ length: e.institution_count }))
  ).size;
  const totalObservations = index.reduce((sum, e) => sum + e.observation_count, 0);
  const featuredEntries = index.filter((e) => isFeaturedFee(e.fee_category));
  const strongMaturity = index.filter((e) => e.maturity_tier === "strong").length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
          { name: "National Fee Index", href: "/research/national-fee-index" },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        National Fee Index
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        US Bank & Credit Union Fee Benchmarks
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        National benchmarking data across {TAXONOMY_COUNT} fee categories,
        computed from published fee schedules of FDIC-insured banks and
        NCUA-insured credit unions. The most comprehensive public dataset of
        US financial institution fees.
      </p>
      <div className="mt-1">
        <DataFreshness />
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Fee Categories
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {index.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Total Observations
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {totalObservations.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Strong Maturity
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {strongMaturity} / {index.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Featured Fees
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {FEATURED_COUNT}
          </p>
        </div>
      </div>

      {/* Index by family */}
      <div className="mt-8 space-y-8">
        {familyOrder.map((familyName) => {
          const entries = byFamily.get(familyName);
          if (!entries || entries.length === 0) return null;
          const colors = FAMILY_COLORS[familyName];

          return (
            <section key={familyName}>
              <h2
                className={`flex items-center gap-2 text-sm font-bold ${colors?.text ?? "text-slate-700"}`}
              >
                <span
                  className={`inline-block h-3 w-1 rounded-full ${colors?.border?.replace("border-l-", "bg-") ?? "bg-slate-400"}`}
                />
                {familyName}
              </h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Fee Category
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Median
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                        P25
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                        P75
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Range
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Banks
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        CUs
                      </th>
                      <th className="hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">
                        Maturity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <tr
                        key={entry.fee_category}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/fees/${entry.fee_category}`}
                            className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                          >
                            {getDisplayName(entry.fee_category)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatAmount(entry.median_amount)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                          {formatAmount(entry.p25_amount)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                          {formatAmount(entry.p75_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {formatAmount(entry.min_amount)} &ndash;{" "}
                          {formatAmount(entry.max_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {entry.bank_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {entry.cu_count.toLocaleString()}
                        </td>
                        <td className="hidden px-4 py-2.5 md:table-cell">
                          <span
                            className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              entry.maturity_tier === "strong"
                                ? "bg-emerald-50 text-emerald-600"
                                : entry.maturity_tier === "provisional"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {entry.maturity_tier}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {/* Methodology */}
      <section className="mt-10 rounded-lg border border-slate-200 bg-slate-50/50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Methodology
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          The National Fee Index is computed from published fee schedules of
          FDIC-insured banks and NCUA-insured credit unions. Fees are
          categorized into {TAXONOMY_COUNT} standard categories across 9
          families. Statistics include pending, staged, and approved fees
          (rejected fees are excluded). Maturity tiers: &ldquo;strong&rdquo;
          (10+ approved observations), &ldquo;provisional&rdquo; (10+ total
          observations), &ldquo;insufficient&rdquo; (fewer than 10).
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "National Fee Index - US Bank & Credit Union Fee Benchmarks",
            description: `National benchmarking data across ${TAXONOMY_COUNT} bank and credit union fee categories.`,
            url: `${SITE_URL}/research/national-fee-index`,
            creator: {
              "@type": "Organization",
              name: "Bank Fee Index",
            },
          }).replace(/</g, "\\u003c"),
        }}
      />

      {!showAll && gatedCount > 0 && (
        <div className="mt-8">
          <UpgradeGate count={gatedCount} message="Unlock all fee categories" />
        </div>
      )}
    </div>
  );
}

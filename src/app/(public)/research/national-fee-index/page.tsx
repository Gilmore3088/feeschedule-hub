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
  // strongMaturity removed — internal metric not shown to consumers

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
          { name: "National Fee Index", href: "/research/national-fee-index" },
        ]}
      />

      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">National Fee Index</span>
      </div>
      <h1
        className="mt-1 text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] font-bold text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        US Bank & Credit Union Fee Benchmarks
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-[#7A7062]">
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
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
            Fee Categories
          </p>
          <p
            className="mt-1 text-lg font-bold tabular-nums text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 300 }}
          >
            {index.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
            Total Observations
          </p>
          <p
            className="mt-1 text-lg font-bold tabular-nums text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 300 }}
          >
            {totalObservations.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
            Fee Categories
          </p>
          <p
            className="mt-1 text-lg font-bold tabular-nums text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 300 }}
          >
            {index.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
            Featured Fees
          </p>
          <p
            className="mt-1 text-lg font-bold tabular-nums text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 300 }}
          >
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
                className={`flex items-center gap-2 text-sm font-bold ${colors?.text ?? "text-[#5A5347]"}`}
              >
                <span
                  className={`inline-block h-3 w-1 rounded-full ${colors?.border?.replace("border-l-", "bg-") ?? "bg-[#A09788]"}`}
                />
                {familyName}
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-[#E8DFD1]/80">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                        Fee Category
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                        Median
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] sm:table-cell">
                        P25
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] sm:table-cell">
                        P75
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                        Range
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                        Banks
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                        CUs
                      </th>
                      <th className="hidden px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] md:table-cell">
                        Institutions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DFD1]/60">
                    {entries.map((entry) => (
                      <tr
                        key={entry.fee_category}
                        className="hover:bg-[#FAF7F2]/60 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/fees/${entry.fee_category}`}
                            className="font-medium text-[#1A1815] hover:text-[#C44B2E] transition-colors"
                          >
                            {getDisplayName(entry.fee_category)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[#1A1815]">
                          {formatAmount(entry.median_amount)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] sm:table-cell">
                          {formatAmount(entry.p25_amount)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] sm:table-cell">
                          {formatAmount(entry.p75_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#7A7062]">
                          {formatAmount(entry.min_amount)} &ndash;{" "}
                          {formatAmount(entry.max_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#7A7062]">
                          {entry.bank_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#7A7062]">
                          {entry.cu_count.toLocaleString()}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] md:table-cell">
                          {entry.institution_count.toLocaleString()}
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
      <section className="mt-10 rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A09788]">
          Methodology
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#7A7062]">
          The National Fee Index is computed from published fee schedules of
          FDIC-insured banks and NCUA-insured credit unions. Fees are
          categorized into {TAXONOMY_COUNT} standard categories across 9
          families. All statistics are based on verified, published fee
          schedules. National medians are computed across all reporting
          institutions for each fee category.
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

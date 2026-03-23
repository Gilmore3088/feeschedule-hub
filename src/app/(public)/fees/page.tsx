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
import { getCurrentUser } from "@/lib/auth";
import { canAccessAllCategories } from "@/lib/access";
import { UpgradeGate } from "@/components/upgrade-gate";
import { getSpotlightCategories } from "@/lib/fee-taxonomy";

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

export default async function FeeCatalogPage() {
  const user = await getCurrentUser();
  const showAll = canAccessAllCategories(user);
  const spotlightCats = new Set(getSpotlightCategories());

  const allSummaries = await getFeeCategorySummaries();
  const summaries = showAll
    ? allSummaries
    : allSummaries.filter((s) => spotlightCats.has(s.fee_category));
  const gatedCount = allSummaries.length - summaries.length;

  const stats = await getStats();
  const freshness = await getDataFreshness();

  const byFamily = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const family = getFeeFamily(s.fee_category) ?? "Other";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(s);
  }

  const familyOrder = Object.keys(FEE_FAMILIES);

  const allMaxAmounts = summaries
    .map((s) => s.max_amount)
    .filter((a): a is number => a !== null && a > 0);
  const globalMax = allMaxAmounts.length > 0 ? Math.max(...allMaxAmounts) : 100;

  const spotlightCategories = ["overdraft", "nsf", "monthly_maintenance", "atm_non_network"];
  const spotlightFees = spotlightCategories
    .map((c) => summaries.find((s) => s.fee_category === c))
    .filter(Boolean) as typeof summaries;

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Index", href: "/fees" },
        ]}
      />

      {/* ── HERO ── */}
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-px w-8 bg-[#C44B2E]/40" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
            Fee Index
          </span>
        </div>

        <h1
          className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Bank & Credit Union Fee Benchmarks
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#A09788]">
          <span>
            <span className="font-medium text-[#5A5347] tabular-nums">
              {freshness.total_observations.toLocaleString()}
            </span>{" "}
            fee observations across{" "}
            <span className="font-medium text-[#5A5347] tabular-nums">
              {stats.total_institutions.toLocaleString()}
            </span>{" "}
            institutions
          </span>
          <span className="h-3 w-px bg-[#D4C9BA]" />
          <span>{TAXONOMY_COUNT} fee categories</span>
          {freshness.last_crawl_at && (
            <>
              <span className="h-3 w-px bg-[#D4C9BA]" />
              <span>
                Updated{" "}
                {new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          )}
        </div>

        <div className="mt-1.5 text-[11px] text-[#A09788]/70">
          Sources: published fee schedules, FDIC Call Reports, NCUA 5300 Reports, institution websites
        </div>
      </div>

      {/* ── SPOTLIGHT STAT CARDS ── */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {spotlightFees.map((fee) => (
          <Link
            key={fee.fee_category}
            href={`/fees/${fee.fee_category}`}
            className="group relative rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm px-5 py-4 transition-all duration-400 hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C44B2E]/0 to-transparent group-hover:via-[#C44B2E]/30 transition-all duration-700" />
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] group-hover:text-[#C44B2E]/70 transition-colors">
              {getDisplayName(fee.fee_category)}
            </p>
            <p
              className="mt-2 text-[28px] font-light tracking-tight text-[#1A1815] tabular-nums"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              {formatAmount(fee.median_amount)}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[#A09788]">
              {formatAmount(fee.min_amount)} &ndash; {formatAmount(fee.max_amount)}
              <span className="mx-1.5 text-[#D4C9BA]">&middot;</span>
              {fee.institution_count.toLocaleString()} inst.
            </p>
          </Link>
        ))}
      </div>

      {/* ── ACTION BAR ── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          { label: "National Fee Index", href: "/research/national-fee-index" },
          { label: "State & district reports", href: "/research" },
          { label: "Consumer guides", href: "/guides" },
          { label: "API", href: "/api-docs" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-[#E8DFD1] bg-white/80 px-4 py-1.5 text-[12px] font-medium text-[#5A5347] transition-all hover:border-[#C44B2E]/30 hover:text-[#C44B2E] no-underline"
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* ── MAIN + SIDEBAR ── */}
      <div className="mt-10 grid grid-cols-1 gap-8 xl:grid-cols-[1fr_280px]">
        {/* Main: Fee families */}
        <div className="space-y-10">
          {familyOrder.map((familyName) => {
            const cats = byFamily.get(familyName);
            if (!cats || cats.length === 0) return null;
            const colors = FAMILY_COLORS[familyName];
            const colorBg = colors?.border?.replace("border-l-", "bg-") ?? "bg-[#A09788]";

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
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className={`flex items-center gap-2 text-sm font-bold ${colors?.text ?? "text-[#5A5347]"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-1.5 rounded-full ${colorBg}`}
                    />
                    {familyName}
                    <span className="ml-1 text-[11px] font-medium text-[#A09788]">
                      ({cats.length})
                    </span>
                  </h2>
                  {sectionAvgMedian !== null && (
                    <div className="hidden sm:flex items-center gap-4 text-[11px] text-[#A09788]">
                      <span>
                        Avg median:{" "}
                        <span className="font-medium text-[#5A5347] tabular-nums">
                          {formatAmount(sectionAvgMedian)}
                        </span>
                      </span>
                      <span>
                        Highest:{" "}
                        <span className="font-medium text-[#5A5347] tabular-nums">
                          {formatAmount(sectionMaxMedian)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
                        <th scope="col" className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                          Fee
                        </th>
                        <th scope="col" className="hidden px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] lg:table-cell">
                          Tier
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                          Median
                        </th>
                        <th scope="col" className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] sm:table-cell">
                          P25
                        </th>
                        <th scope="col" className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] sm:table-cell">
                          P75
                        </th>
                        <th scope="col" className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] md:table-cell">
                          Range
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                          Distribution
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                          Inst.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD1]/40">
                      {cats.map((cat) => {
                        const tier = getFeeTier(cat.fee_category);
                        const barP25 = cat.p25_amount ?? cat.min_amount ?? 0;
                        const barP75 = cat.p75_amount ?? cat.max_amount ?? 0;
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
                            className="group hover:bg-[#FAF7F2]/60 transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <Link
                                href={`/fees/${cat.fee_category}`}
                                className="font-medium text-[#1A1815] group-hover:text-[#C44B2E] transition-colors"
                              >
                                {getDisplayName(cat.fee_category)}
                              </Link>
                            </td>
                            <td className="hidden px-4 py-2.5 lg:table-cell">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
                                {TIER_LABELS[tier]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1A1815]">
                              {formatAmount(cat.median_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] sm:table-cell">
                              {formatAmount(cat.p25_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#7A7062] sm:table-cell">
                              {formatAmount(cat.p75_amount)}
                            </td>
                            <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#A09788] text-[12px] md:table-cell">
                              {formatAmount(cat.min_amount ?? 0)} &ndash;{" "}
                              {formatAmount(cat.max_amount ?? 0)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="relative h-3 w-full min-w-[80px] rounded-full bg-[#E8DFD1]/40">
                                <div
                                  className="absolute top-0 h-3 rounded-full bg-[#D4C9BA]/70 group-hover:bg-[#C44B2E]/20 transition-colors"
                                  style={{
                                    left: `${Math.min(barLeftPct, 95)}%`,
                                    width: `${Math.min(barWidthPct, 100 - barLeftPct)}%`,
                                  }}
                                />
                                {cat.median_amount !== null && (
                                  <div
                                    className="absolute top-0 h-3 w-0.5 rounded-full bg-[#7A7062] group-hover:bg-[#C44B2E] transition-colors"
                                    style={{
                                      left: `${Math.min(medianPct, 98)}%`,
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[#7A7062]">
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
          <div className="rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
              Jump to Family
            </p>
            <nav className="mt-3 space-y-1">
              {familyOrder.map((familyName) => {
                const cats = byFamily.get(familyName);
                if (!cats || cats.length === 0) return null;
                const colors = FAMILY_COLORS[familyName];
                const colorBg = colors?.border?.replace("border-l-", "bg-") ?? "bg-[#A09788]";

                return (
                  <a
                    key={familyName}
                    href={`#${familyName.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
                    className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-[#7A7062] transition-colors hover:bg-[#FAF7F2] hover:text-[#1A1815]"
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${colorBg}`}
                    />
                    {familyName}
                    <span className="ml-auto text-[11px] text-[#D4C9BA]">
                      {cats.length}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Key benchmarks */}
          <div className="rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm px-4 py-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C44B2E]/30 to-transparent" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#C44B2E]/60">
              Key Benchmarks
            </p>
            <div className="mt-3 space-y-3">
              {spotlightFees.slice(0, 6).map((fee) => (
                <Link
                  key={fee.fee_category}
                  href={`/fees/${fee.fee_category}`}
                  className="block group no-underline"
                >
                  <span className="text-[11px] text-[#A09788] group-hover:text-[#C44B2E] transition-colors">
                    {getDisplayName(fee.fee_category)}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className="text-lg tabular-nums font-light text-[#1A1815]"
                      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                    >
                      {formatAmount(fee.median_amount)}
                    </span>
                    <span className="text-[10px] text-[#A09788]">median</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Go deeper */}
          <div className="rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
              Go Deeper
            </p>
            <div className="mt-3 space-y-2">
              {[
                { label: "Full national index", href: "/research/national-fee-index" },
                { label: "State & district reports", href: "/research" },
                { label: "Consumer guides", href: "/guides" },
                { label: "API documentation", href: "/api-docs" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 text-[13px] text-[#7A7062] hover:text-[#C44B2E] transition-colors"
                >
                  <span className="h-1 w-1 rounded-full bg-[#D4C9BA] shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Data sources */}
          <div className="rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
              Data Sources
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-[#7A7062]">
              <li>Published fee schedules</li>
              <li>FDIC Call Reports</li>
              <li>NCUA 5300 Reports</li>
              <li>Institution websites</li>
            </ul>
            <div className="mt-3 border-t border-[#E8DFD1]/60 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
                Coverage
              </p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-[#7A7062]">
                <li>Banks + Credit Unions</li>
                <li>All asset tiers</li>
                <li>All 12 Fed districts</li>
                <li>50 states</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* Upgrade gate for free users */}
      {!showAll && gatedCount > 0 && (
        <div className="mt-8">
          <UpgradeGate count={gatedCount} />
        </div>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Bank Fee Index - Complete Fee Catalog",
            description:
              "National benchmarking data across 49 bank and credit union fee categories.",
            url: `${SITE_URL}/fees`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

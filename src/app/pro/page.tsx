export const dynamic = "force-dynamic";
import Link from "next/link";
import {
  getNationalIndexCached,
  getPublicStats,
  getDataFreshness,
  getStatesWithFeeData,
  getPeerIndex,
  getCharterFeeRevenueSummary,
  getTierFeeRevenueSummary,
} from "@/lib/crawler-db";
import {
  getDisplayName,
  getFeaturedCategories,
  FEE_FAMILIES,
} from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { Eyebrow } from "@/components/ui/eyebrow";

const TICKER_CATEGORIES = [
  "monthly_maintenance",
  "overdraft",
  "nsf",
  "atm_non_network",
  "wire_domestic_outgoing",
  "card_foreign_txn",
  "stop_payment",
  "cashiers_check",
];

export default async function ProHomePage() {
  // Pro users get personalized dashboard
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // not logged in
  }

  if (user && canAccessPremium(user)) {
    redirect("/pro/monitor");
  }

  // Non-pro users get marketing page
  const allEntries = await getNationalIndexCached();
  const stats = await getPublicStats();
  const freshness = await getDataFreshness();
  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "---";

  const tickerEntries = TICKER_CATEGORIES.map((cat) =>
    allEntries.find((e) => e.fee_category === cat)
  ).filter(Boolean);

  const featuredCategories = getFeaturedCategories();
  const featuredEntries = featuredCategories
    .map((cat) => allEntries.find((e) => e.fee_category === cat))
    .filter(Boolean)
    .slice(0, 15);

  // Charter comparison
  const bankIndex = await getPeerIndex({ charter_type: "bank" });
  const cuIndex = await getPeerIndex({ charter_type: "credit_union" });
  const charterComparison = TICKER_CATEGORIES.map((cat) => {
    const bank = bankIndex.find((e) => e.fee_category === cat);
    const cu = cuIndex.find((e) => e.fee_category === cat);
    const national = allEntries.find((e) => e.fee_category === cat);
    if (!bank || !cu || !national) return null;
    if (bank.median_amount === null || cu.median_amount === null || national.median_amount === null) return null;
    return {
      category: cat,
      national: national.median_amount,
      bank: bank.median_amount,
      cu: cu.median_amount,
      bankN: bank.institution_count,
      cuN: cu.institution_count,
    };
  }).filter(Boolean);

  // Revenue data
  let tierRevenue: {
    asset_tier: string;
    avg_fee: number;
    avg_service_charges: number;
    institution_count: number;
  }[] = [];
  try {
    tierRevenue = (await getTierFeeRevenueSummary()).map((r) => ({
      asset_tier: r.asset_size_tier,
      avg_fee: r.avg_fee_amount,
      avg_service_charges: r.avg_service_charge_income,
      institution_count: r.institution_count,
    }));
  } catch {
    // may not be available
  }

  // Coverage stats
  const statesData = await getStatesWithFeeData();
  const totalStates = statesData.length;
  const familyCount = Object.keys(FEE_FAMILIES).length;

  return (
    <div>
      {/* ── Live Ticker Strip ── */}
      <div className="border-b border-[#E8DFD1] bg-[#FFFDF9]">
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-center gap-6 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.15em] text-[#C44B2E]">
            National Medians
          </span>
          <span className="shrink-0 h-3 w-px bg-[#D5CBBF]" />
          {tickerEntries.map((entry) => (
            <span
              key={entry!.fee_category}
              className="shrink-0 flex items-center gap-2 text-[11px]"
            >
              <span className="text-[#7A7062]">
                {getDisplayName(entry!.fee_category)}
              </span>
              <span className="font-semibold text-[#1A1815] tabular-nums">
                {formatAmount(entry!.median_amount)}
              </span>
            </span>
          ))}
          <span className="shrink-0 ml-auto text-[10px] text-[#D5CBBF]">
            {lastUpdated}
          </span>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(196,75,46,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(196,75,46,.15) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h1
                className="text-[2rem] sm:text-[2.5rem] lg:text-[3rem] leading-[1.06] tracking-[-0.03em] text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                The national benchmark
                <br />
                for <span className="text-[#C44B2E]">banking fees</span>
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#5A5347]">
                Institutional-grade fee indexing, peer benchmarks, and
                district-level analysis for banking professionals, consultants,
                and researchers.
              </p>

              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "Institutions",
                    value: stats.total_institutions.toLocaleString(),
                  },
                  {
                    label: "Observations",
                    value: stats.total_observations.toLocaleString(),
                  },
                  {
                    label: "Categories",
                    value: `${stats.total_categories} / ${familyCount} families`,
                  },
                  {
                    label: "Coverage",
                    value: `${totalStates} states`,
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] px-4 py-3"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A69D90]">
                      {metric.label}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-[#1A1815] tabular-nums">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/research/national-fee-index"
                  className="inline-flex items-center gap-2 rounded-md bg-[#C44B2E] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#A83D25] transition-colors no-underline"
                >
                  View National Index
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="mailto:hello@bankfeeindex.com"
                  className="inline-flex items-center rounded border border-[#D5CBBF] px-5 py-2.5 text-[13px] font-medium text-[#5A5347] hover:border-[#1A1815] hover:text-[#1A1815] transition-colors no-underline"
                >
                  Request Data Access
                </Link>
              </div>
            </div>

            {/* Index preview card */}
            <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8DFD1] flex items-center justify-between">
                <Eyebrow tone="dark" size="tight">
                  National Fee Index
                </Eyebrow>
                <span className="text-[10px] text-[#A69D90]">
                  {allEntries.length} categories
                </span>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8DFD1]">
                    <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Category
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Median
                    </th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      P25-P75
                    </th>
                    <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      N
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickerEntries.map((entry, i) => (
                    <tr
                      key={entry!.fee_category}
                      className={
                        i < tickerEntries.length - 1
                          ? "border-b border-[#E8DFD1]"
                          : ""
                      }
                    >
                      <td className="px-5 py-2.5 text-[#1A1815]">
                        {getDisplayName(entry!.fee_category)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-[#1A1815] tabular-nums">
                        {formatAmount(entry!.median_amount)}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-right text-[#7A7062] tabular-nums text-[11px]">
                        {entry!.p25_amount !== null &&
                        entry!.p75_amount !== null
                          ? `${formatAmount(entry!.p25_amount)}-${formatAmount(entry!.p75_amount)}`
                          : "-"}
                      </td>
                      <td className="px-5 py-2.5 text-right text-[#A69D90] tabular-nums">
                        {entry!.institution_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-[#E8DFD1] flex items-center justify-between">
                <span className="text-[10px] text-[#D5CBBF]">
                  Validated medians from published fee schedules
                </span>
                <Link
                  href="/research/national-fee-index"
                  className="text-[11px] font-semibold text-[#C44B2E] hover:text-[#C44B2E] transition-colors no-underline"
                >
                  Full index
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Charter Type Comparison ── */}
      {charterComparison.length > 0 && (
        <section className="border-t border-[#E8DFD1]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="flex items-end justify-between mb-6">
              <div>
                <Eyebrow as="h2">Peer Segmentation: Charter Type</Eyebrow>
                <p className="mt-1 text-[13px] text-[#7A7062]">
                  National vs. Bank vs. Credit Union medians
                </p>
              </div>
              <Link
                href="/research/fee-revenue-analysis"
                className="text-[11px] font-semibold text-[#C44B2E] hover:text-[#C44B2E] transition-colors no-underline"
              >
                Fee-Revenue Analysis
              </Link>
            </div>
            <div className="rounded-lg border border-[#E8DFD1] overflow-hidden">
              {/* Mobile: stacked cards (don't hide N columns; reformat).
                  Below sm the table dropped peer N entirely — bankers were left
                  guessing sample size. Cards keep every field visible. */}
              <ul className="sm:hidden divide-y divide-[#E8DFD1]">
                {charterComparison.map((row) => {
                  const delta = row!.bank - row!.cu;
                  const deltaPct =
                    row!.cu > 0 ? ((delta / row!.cu) * 100).toFixed(0) : "0";
                  return (
                    <li key={row!.category} className="px-5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[13px] font-semibold text-[#1A1815]">
                          {getDisplayName(row!.category)}
                        </p>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            delta > 0
                              ? "text-red-400"
                              : delta < 0
                                ? "text-emerald-400"
                                : "text-[#7A7062]"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {deltaPct}% Δ
                        </span>
                      </div>
                      <dl className="mt-1.5 grid grid-cols-3 gap-x-3 text-[11px]">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider text-[#A69D90]">
                            National
                          </dt>
                          <dd className="text-[#5A5347] tabular-nums">
                            {formatAmount(row!.national)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider text-[#A69D90]">
                            Bank
                            <span className="ml-1 text-[#D5CBBF] tabular-nums">
                              n={row!.bankN.toLocaleString()}
                            </span>
                          </dt>
                          <dd className="font-semibold text-[#1A1815] tabular-nums">
                            {formatAmount(row!.bank)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider text-[#A69D90]">
                            CU
                            <span className="ml-1 text-[#D5CBBF] tabular-nums">
                              n={row!.cuN.toLocaleString()}
                            </span>
                          </dt>
                          <dd className="font-semibold text-[#1A1815] tabular-nums">
                            {formatAmount(row!.cu)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>

              {/* sm+: traditional table */}
              <table className="hidden sm:table w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8DFD1] bg-[#FAF7F2]">
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Category
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      National
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Bank
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#7A7062]">
                      N
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Credit Union
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#7A7062]">
                      N
                    </th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                      Delta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {charterComparison.map((row, i) => {
                    const delta = row!.bank - row!.cu;
                    const deltaPct =
                      row!.cu > 0
                        ? ((delta / row!.cu) * 100).toFixed(0)
                        : "0";
                    return (
                      <tr
                        key={row!.category}
                        className={`hover:bg-[#FFF0ED] transition-colors ${
                          i < charterComparison.length - 1
                            ? "border-b border-[#E8DFD1]"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-2.5 text-[#1A1815]">
                          {getDisplayName(row!.category)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#5A5347] tabular-nums">
                          {formatAmount(row!.national)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#1A1815] tabular-nums">
                          {formatAmount(row!.bank)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#D5CBBF] tabular-nums text-[11px]">
                          {row!.bankN.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#1A1815] tabular-nums">
                          {formatAmount(row!.cu)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#D5CBBF] tabular-nums text-[11px]">
                          {row!.cuN.toLocaleString()}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          <span
                            className={`text-[11px] font-semibold ${
                              delta > 0
                                ? "text-red-400"
                                : delta < 0
                                  ? "text-emerald-400"
                                  : "text-[#7A7062]"
                            }`}
                          >
                            {delta > 0 ? "+" : ""}
                            {deltaPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-2 border-t border-[#E8DFD1] bg-[#FAF7F2]">
                <p className="text-[10px] text-[#D5CBBF]">
                  Delta = Bank median minus Credit Union median as % of CU
                  median. Positive = banks charge more.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Revenue Correlation by Tier ── */}
      {tierRevenue.length > 0 && (
        <section className="border-t border-[#E8DFD1]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="flex items-end justify-between mb-6">
              <div>
                <Eyebrow as="h2">Fee-to-Revenue Correlation</Eyebrow>
                <p className="mt-1 text-[13px] text-[#7A7062]">
                  Average fee levels vs. service charge income by asset tier
                </p>
              </div>
              <Link
                href="/research/fee-revenue-analysis"
                className="text-[11px] font-semibold text-[#C44B2E] hover:text-[#C44B2E] transition-colors no-underline"
              >
                Full analysis
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {tierRevenue.map((tier) => (
                <div
                  key={tier.asset_tier}
                  className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] p-5"
                >
                  <Eyebrow as="p" tone="subtle" size="tight">
                    {tier.asset_tier}
                  </Eyebrow>
                  <p className="mt-3 text-[20px] font-bold text-[#1A1815] tabular-nums">
                    {formatAmount(tier.avg_fee)}
                  </p>
                  <p className="text-[10px] text-[#A69D90]">avg fee level</p>
                  <div className="mt-3 pt-3 border-t border-[#E8DFD1]">
                    <p className="text-[13px] font-semibold text-[#1A1815] tabular-nums">
                      {formatAmount(tier.avg_service_charges)}
                    </p>
                    <p className="text-[10px] text-[#A69D90]">
                      avg service charges ($K)
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] text-[#D5CBBF] tabular-nums">
                    {tier.institution_count} institutions
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Platform Capabilities ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <Eyebrow as="h2" className="mb-8 block">Platform Capabilities</Eyebrow>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Fee Indexing",
                desc: "National and peer-level medians across 49 categories with P25/P75 ranges and maturity tiers.",
                href: "/research/national-fee-index",
                accent: "border-[#E0C9B8]",
              },
              {
                title: "Peer Benchmarks",
                desc: "Segment by charter type, asset tier, and Fed district for institutional peer comparison.",
                href: "/fees",
                accent: "border-[#E0C9B8]",
              },
              {
                title: "Research & Analysis",
                desc: "State-level reports, Fed district analysis, fee-to-revenue correlations, and Beige Book context.",
                href: "/research",
                accent: "border-[#E0C9B8]",
              },
              {
                title: "Data & API",
                desc: "RESTful API access, CSV exports, and institutional-grade data feeds for integration.",
                href: "/api-docs",
                accent: "border-[#E0C9B8]",
              },
            ].map((cap) => (
              <Link
                key={cap.title}
                href={cap.href}
                className={`group rounded-lg border ${cap.accent} bg-[#FFFDF9] p-5 hover:bg-[#FAF7F2] transition-all duration-300 no-underline`}
              >
                <h3
                  className="text-[13px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  {cap.title}
                </h3>
                <p className="mt-2 text-[12px] leading-relaxed text-[#7A7062]">
                  {cap.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full Featured Index ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="flex items-end justify-between mb-6">
            <div>
              <Eyebrow as="h2">
                Featured Index
              </Eyebrow>
              <p className="mt-1 text-[13px] text-[#7A7062]">
                {featuredEntries.length} core categories
              </p>
            </div>
            <Link
              href="/fees"
              className="text-[11px] font-semibold text-[#C44B2E] hover:text-[#C44B2E] transition-colors no-underline"
            >
              View all {allEntries.length} categories
            </Link>
          </div>
          <div className="rounded-lg border border-[#E8DFD1] overflow-hidden">
            {/* Mobile: stacked cards (don't hide P25/P75/Min/Max; reformat).
                The table previously dropped these columns at md/lg, so a
                banker checking on a phone before a meeting lost the spread —
                the data they need most for benchmarking. Cards keep all of
                it visible. */}
            <ul className="md:hidden divide-y divide-[#E8DFD1]">
              {featuredEntries.map((entry) => {
                const hasRange =
                  entry!.p25_amount !== null && entry!.p75_amount !== null;
                const hasMinMax =
                  entry!.min_amount !== null && entry!.max_amount !== null;
                return (
                  <li key={entry!.fee_category} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/fees/${entry!.fee_category}`}
                        className="text-[13px] font-semibold text-[#1A1815] hover:text-[#C44B2E] transition-colors no-underline"
                      >
                        {getDisplayName(entry!.fee_category)}
                      </Link>
                      <span className="text-[15px] font-semibold text-[#1A1815] tabular-nums">
                        {formatAmount(entry!.median_amount)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="text-[#7A7062]">
                        {hasRange ? (
                          <>
                            <span className="uppercase tracking-wider text-[10px] text-[#A69D90]">
                              P25–P75:
                            </span>{" "}
                            <span className="tabular-nums">
                              {formatAmount(entry!.p25_amount!)}–
                              {formatAmount(entry!.p75_amount!)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[#A69D90]">no range</span>
                        )}
                      </span>
                      <span className="text-[#A69D90] tabular-nums">
                        n={entry!.institution_count.toLocaleString()}
                      </span>
                    </div>
                    {hasMinMax && (
                      <p className="mt-0.5 text-[10px] text-[#A69D90] tabular-nums">
                        Range {formatAmount(entry!.min_amount!)}–
                        {formatAmount(entry!.max_amount!)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* md+: traditional table with progressive column reveal */}
            <table className="hidden md:table w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFD1] bg-[#FAF7F2]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    Category
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    Median
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    P25
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    P75
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    Min
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    Max
                  </th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#A69D90]">
                    Inst.
                  </th>
                </tr>
              </thead>
              <tbody>
                {featuredEntries.map((entry, i) => (
                  <tr
                    key={entry!.fee_category}
                    className={`hover:bg-[#FFF0ED] transition-colors ${
                      i < featuredEntries.length - 1
                        ? "border-b border-[#E8DFD1]"
                        : ""
                    }`}
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/fees/${entry!.fee_category}`}
                        className="text-[#1A1815] hover:text-[#C44B2E] transition-colors no-underline"
                      >
                        {getDisplayName(entry!.fee_category)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#1A1815] tabular-nums">
                      {formatAmount(entry!.median_amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#7A7062] tabular-nums">
                      {entry!.p25_amount !== null
                        ? formatAmount(entry!.p25_amount)
                        : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#7A7062] tabular-nums">
                      {entry!.p75_amount !== null
                        ? formatAmount(entry!.p75_amount)
                        : "-"}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right text-[#A69D90] tabular-nums">
                      {entry!.min_amount !== null
                        ? formatAmount(entry!.min_amount)
                        : "-"}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right text-[#A69D90] tabular-nums">
                      {entry!.max_amount !== null
                        ? formatAmount(entry!.max_amount)
                        : "-"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#A69D90] tabular-nums">
                      {entry!.institution_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Access Tiers ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <Eyebrow as="h2" className="mb-8 block">Access</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] p-6">
              <p
                className="text-[13px] font-semibold text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                Data Subscription
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#7A7062]">
                Full API access, bulk CSV exports, peer index queries, and
                district-level data feeds. For institutions and data teams.
              </p>
              <Link
                href="/subscribe"
                className="mt-6 inline-flex items-center rounded border border-[#C44B2E] bg-[#C44B2E] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#A83D25] transition-colors no-underline"
              >
                View Plans
              </Link>
            </div>
            <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] p-6">
              <p
                className="text-[13px] font-semibold text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                Consulting & Research
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#7A7062]">
                Custom competitive analysis, pricing strategy support, and
                original research engagements. For consultants and strategists.
              </p>
              <Link
                href="mailto:hello@bankfeeindex.com"
                className="mt-6 inline-flex items-center rounded border border-[#D5CBBF] px-4 py-2 text-[12px] font-semibold text-[#5A5347] hover:border-[#1A1815] hover:text-[#1A1815] transition-colors no-underline"
              >
                Get in Touch
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

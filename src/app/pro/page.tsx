import Link from "next/link";
import {
  getNationalIndex,
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

  const allEntries = getNationalIndex();
  const stats = getPublicStats();
  const freshness = getDataFreshness();
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
  const bankIndex = getPeerIndex({ charter_type: "bank" });
  const cuIndex = getPeerIndex({ charter_type: "credit_union" });
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
    tierRevenue = getTierFeeRevenueSummary().map((r) => ({
      asset_tier: r.asset_size_tier,
      avg_fee: r.avg_fee_amount,
      avg_service_charges: r.avg_service_charge_income,
      institution_count: r.institution_count,
    }));
  } catch {
    // may not be available
  }

  // Coverage stats
  const statesData = getStatesWithFeeData();
  const totalStates = statesData.length;
  const familyCount = FEE_FAMILIES.length;

  return (
    <div>
      {/* ── Live Ticker Strip ── */}
      <div className="border-b border-white/[0.04] bg-[#060810]">
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-center gap-6 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/60">
            National Medians
          </span>
          <span className="shrink-0 h-3 w-px bg-white/[0.08]" />
          {tickerEntries.map((entry) => (
            <span
              key={entry!.fee_category}
              className="shrink-0 flex items-center gap-2 text-[11px]"
            >
              <span className="text-slate-500">
                {getDisplayName(entry!.fee_category)}
              </span>
              <span className="font-semibold text-slate-200 tabular-nums">
                {formatAmount(entry!.median_amount)}
              </span>
            </span>
          ))}
          <span className="shrink-0 ml-auto text-[10px] text-slate-700">
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
              "linear-gradient(rgba(59,130,246,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.3) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h1
                className="text-[2rem] sm:text-[2.5rem] lg:text-[3rem] leading-[1.06] tracking-[-0.03em] text-white"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                National Fee
                <br />
                Intelligence
                <br />
                Platform.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">
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
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">
                      {metric.label}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-white tabular-nums">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/research/national-fee-index"
                  className="inline-flex items-center gap-2 rounded border border-blue-500/40 bg-blue-500/10 px-5 py-2.5 text-[13px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors no-underline"
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
                  href="/waitlist"
                  className="inline-flex items-center rounded border border-white/[0.08] px-5 py-2.5 text-[13px] font-medium text-slate-400 hover:border-white/[0.15] hover:text-slate-200 transition-colors no-underline"
                >
                  Request Data Access
                </Link>
              </div>
            </div>

            {/* Index preview card */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
                <span
                  className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-400"
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  National Fee Index
                </span>
                <span className="text-[10px] text-slate-600">
                  {allEntries.length} categories
                </span>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Category
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Median
                    </th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      P25-P75
                    </th>
                    <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
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
                          ? "border-b border-white/[0.03]"
                          : ""
                      }
                    >
                      <td className="px-5 py-2.5 text-slate-300">
                        {getDisplayName(entry!.fee_category)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-white tabular-nums">
                        {formatAmount(entry!.median_amount)}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-right text-slate-500 tabular-nums text-[11px]">
                        {entry!.p25_amount !== null &&
                        entry!.p75_amount !== null
                          ? `${formatAmount(entry!.p25_amount)}-${formatAmount(entry!.p75_amount)}`
                          : "-"}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">
                        {entry!.institution_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] text-slate-700">
                  Validated medians from published fee schedules
                </span>
                <Link
                  href="/research/national-fee-index"
                  className="text-[11px] font-semibold text-blue-400/70 hover:text-blue-300 transition-colors no-underline"
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
        <section className="border-t border-white/[0.04]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600"
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  Peer Segmentation: Charter Type
                </h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  National vs. Bank vs. Credit Union medians
                </p>
              </div>
              <Link
                href="/research/fee-revenue-analysis"
                className="text-[11px] font-semibold text-blue-400/60 hover:text-blue-300 transition-colors no-underline"
              >
                Fee-Revenue Analysis
              </Link>
            </div>
            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Category
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      National
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Bank
                    </th>
                    <th className="hidden sm:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      N
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Credit Union
                    </th>
                    <th className="hidden sm:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      N
                    </th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
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
                        className={`hover:bg-blue-500/[0.03] transition-colors ${
                          i < charterComparison.length - 1
                            ? "border-b border-white/[0.03]"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-2.5 text-slate-300">
                          {getDisplayName(row!.category)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums">
                          {formatAmount(row!.national)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-white tabular-nums">
                          {formatAmount(row!.bank)}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right text-slate-700 tabular-nums text-[11px]">
                          {row!.bankN.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-white tabular-nums">
                          {formatAmount(row!.cu)}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right text-slate-700 tabular-nums text-[11px]">
                          {row!.cuN.toLocaleString()}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          <span
                            className={`text-[11px] font-semibold ${
                              delta > 0
                                ? "text-red-400"
                                : delta < 0
                                  ? "text-emerald-400"
                                  : "text-slate-500"
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
              <div className="px-5 py-2 border-t border-white/[0.04] bg-white/[0.01]">
                <p className="text-[10px] text-slate-700">
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
        <section className="border-t border-white/[0.04]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600"
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  Fee-to-Revenue Correlation
                </h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Average fee levels vs. service charge income by asset tier
                </p>
              </div>
              <Link
                href="/research/fee-revenue-analysis"
                className="text-[11px] font-semibold text-blue-400/60 hover:text-blue-300 transition-colors no-underline"
              >
                Full analysis
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {tierRevenue.map((tier) => (
                <div
                  key={tier.asset_tier}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
                >
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500"
                    style={{
                      fontFamily: "var(--font-jetbrains), monospace",
                    }}
                  >
                    {tier.asset_tier}
                  </p>
                  <p className="mt-3 text-[20px] font-bold text-white tabular-nums">
                    {formatAmount(tier.avg_fee)}
                  </p>
                  <p className="text-[10px] text-slate-600">avg fee level</p>
                  <div className="mt-3 pt-3 border-t border-white/[0.04]">
                    <p className="text-[13px] font-semibold text-slate-300 tabular-nums">
                      {formatAmount(tier.avg_service_charges)}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      avg service charges ($K)
                    </p>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-700 tabular-nums">
                    {tier.institution_count} institutions
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Platform Capabilities ── */}
      <section className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <h2
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 mb-8"
            style={{ fontFamily: "var(--font-jetbrains), monospace" }}
          >
            Platform Capabilities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Fee Indexing",
                desc: "National and peer-level medians across 49 categories with P25/P75 ranges and maturity tiers.",
                href: "/research/national-fee-index",
                accent: "border-blue-500/30",
              },
              {
                title: "Peer Benchmarks",
                desc: "Segment by charter type, asset tier, and Fed district for institutional peer comparison.",
                href: "/fees",
                accent: "border-cyan-500/30",
              },
              {
                title: "Research & Analysis",
                desc: "State-level reports, Fed district analysis, fee-to-revenue correlations, and Beige Book context.",
                href: "/research",
                accent: "border-emerald-500/30",
              },
              {
                title: "Data & API",
                desc: "RESTful API access, CSV exports, and institutional-grade data feeds for integration.",
                href: "/api-docs",
                accent: "border-violet-500/30",
              },
            ].map((cap) => (
              <Link
                key={cap.title}
                href={cap.href}
                className={`group rounded-lg border ${cap.accent} bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-all duration-300 no-underline`}
              >
                <h3
                  className="text-[13px] font-semibold text-white group-hover:text-blue-300 transition-colors"
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  {cap.title}
                </h3>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                  {cap.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full Featured Index ── */}
      <section className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                Featured Index
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                {featuredEntries.length} core categories
              </p>
            </div>
            <Link
              href="/fees"
              className="text-[11px] font-semibold text-blue-400/60 hover:text-blue-300 transition-colors no-underline"
            >
              View all {allEntries.length} categories
            </Link>
          </div>
          <div className="rounded-lg border border-white/[0.06] overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Category
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Median
                  </th>
                  <th className="hidden md:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    P25
                  </th>
                  <th className="hidden md:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    P75
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Min
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Max
                  </th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Inst.
                  </th>
                </tr>
              </thead>
              <tbody>
                {featuredEntries.map((entry, i) => (
                  <tr
                    key={entry!.fee_category}
                    className={`hover:bg-blue-500/[0.03] transition-colors ${
                      i < featuredEntries.length - 1
                        ? "border-b border-white/[0.03]"
                        : ""
                    }`}
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/fees/${entry!.fee_category}`}
                        className="text-slate-300 hover:text-blue-300 transition-colors no-underline"
                      >
                        {getDisplayName(entry!.fee_category)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-white tabular-nums">
                      {formatAmount(entry!.median_amount)}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right text-slate-500 tabular-nums">
                      {entry!.p25_amount !== null
                        ? formatAmount(entry!.p25_amount)
                        : "-"}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right text-slate-500 tabular-nums">
                      {entry!.p75_amount !== null
                        ? formatAmount(entry!.p75_amount)
                        : "-"}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right text-slate-600 tabular-nums">
                      {entry!.min_amount !== null
                        ? formatAmount(entry!.min_amount)
                        : "-"}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right text-slate-600 tabular-nums">
                      {entry!.max_amount !== null
                        ? formatAmount(entry!.max_amount)
                        : "-"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">
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
      <section className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <h2
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 mb-8"
            style={{ fontFamily: "var(--font-jetbrains), monospace" }}
          >
            Access
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
              <p
                className="text-[13px] font-semibold text-white"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                Data Subscription
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
                Full API access, bulk CSV exports, peer index queries, and
                district-level data feeds. For institutions and data teams.
              </p>
              <Link
                href="/waitlist"
                className="mt-6 inline-flex items-center rounded border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[12px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors no-underline"
              >
                Request Access
              </Link>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
              <p
                className="text-[13px] font-semibold text-white"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                Consulting & Research
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
                Custom competitive analysis, pricing strategy support, and
                original research engagements. For consultants and strategists.
              </p>
              <Link
                href="/waitlist"
                className="mt-6 inline-flex items-center rounded border border-white/[0.08] px-4 py-2 text-[12px] font-semibold text-slate-400 hover:border-white/[0.15] hover:text-slate-200 transition-colors no-underline"
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

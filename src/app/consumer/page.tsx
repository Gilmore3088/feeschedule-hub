import Link from "next/link";
import {
  getNationalIndex,
  getPublicStats,
  getDataFreshness,
  getStatesWithFeeData,
  getPeerIndex,
} from "@/lib/crawler-db";
import { getDisplayName, getSpotlightCategories } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

const HERO_FEES = [
  "overdraft",
  "nsf",
  "monthly_maintenance",
  "atm_non_network",
  "wire_domestic_outgoing",
  "card_foreign_txn",
];

const GUIDE_PREVIEWS = [
  {
    slug: "overdraft-fees",
    title: "Overdraft Fees",
    desc: "What banks charge when you spend more than your balance, and how to avoid it.",
    category: "overdraft",
  },
  {
    slug: "nsf-fees",
    title: "NSF (Bounced Check) Fees",
    desc: "What happens when a payment bounces, and what the typical charge looks like.",
    category: "nsf",
  },
  {
    slug: "atm-fees",
    title: "ATM Fees",
    desc: "Out-of-network ATM surcharges and how they vary across the country.",
    category: "atm_non_network",
  },
  {
    slug: "wire-transfer-fees",
    title: "Wire Transfer Fees",
    desc: "Domestic outgoing wire transfer costs and what to expect at different banks.",
    category: "wire_domestic_outgoing",
  },
];

export default async function ConsumerHomePage() {

  const allEntries = getNationalIndex();
  const stats = getPublicStats();
  const freshness = getDataFreshness();
  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "---";

  const heroEntries = HERO_FEES.map((cat) =>
    allEntries.find((e) => e.fee_category === cat)
  ).filter(Boolean);

  const spotlightEntries = getSpotlightCategories()
    .map((cat) => allEntries.find((e) => e.fee_category === cat))
    .filter(Boolean);

  // Bank vs Credit Union comparison
  const bankIndex = getPeerIndex({ charter_type: "bank" });
  const cuIndex = getPeerIndex({ charter_type: "credit_union" });
  const comparisonCategories = [
    "overdraft",
    "nsf",
    "monthly_maintenance",
    "atm_non_network",
  ];
  const bankVsCu = comparisonCategories
    .map((cat) => {
      const bank = bankIndex.find((e) => e.fee_category === cat);
      const cu = cuIndex.find((e) => e.fee_category === cat);
      const national = allEntries.find((e) => e.fee_category === cat);
      if (!bank || !cu || !national) return null;
      if (bank.median_amount === null || cu.median_amount === null || national.median_amount === null) return null;
      return {
        category: cat,
        bankMedian: bank.median_amount,
        cuMedian: cu.median_amount,
        nationalMedian: national.median_amount,
        diff: bank.median_amount - cu.median_amount,
      };
    })
    .filter(Boolean);

  // Top states by coverage
  const statesData = getStatesWithFeeData().slice(0, 10);

  // Fee revenue insights
  // Compute some insights
  const overdraftEntry = allEntries.find((e) => e.fee_category === "overdraft");
  const nsfEntry = allEntries.find((e) => e.fee_category === "nsf");
  const maintenanceEntry = allEntries.find(
    (e) => e.fee_category === "monthly_maintenance"
  );
  const annualMaintenanceCost = maintenanceEntry?.median_amount
    ? maintenanceEntry.median_amount * 12
    : 0;

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#C44B2E]/[0.03] to-transparent pointer-events-none" />
        <div className="mx-auto max-w-6xl px-6 py-10 lg:py-12">
          <div className="max-w-xl">
            <h1
              className="text-[1.75rem] sm:text-[2.25rem] lg:text-[2.5rem] leading-[1.08] tracking-[-0.02em] text-[#1A1815]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
              }}
            >
              What is your bank{" "}
              <em style={{ fontStyle: "italic", fontWeight: 300 }}>really</em>{" "}
              charging you?
            </h1>
            <p className="mt-5 text-[15px] lg:text-[17px] leading-relaxed text-[#6B6355] max-w-lg">
              See how your bank&apos;s fees compare to the national average.
              Data from{" "}
              {stats.total_institutions.toLocaleString()} institutions across
              the United States.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fees"
                className="inline-flex items-center gap-2 rounded-full bg-[#C44B2E] px-7 py-3.5 text-[14px] lg:text-[15px] font-semibold text-white hover:bg-[#A93D25] transition-colors no-underline"
              >
                Compare Fees
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
                href="/guides"
                className="inline-flex items-center rounded-full border border-[#D4C9BA] px-7 py-3.5 text-[14px] lg:text-[15px] font-medium text-[#5A5347] hover:border-[#B0A596] hover:text-[#1A1815] transition-colors no-underline"
              >
                Read Guides
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Spotlight: The Fees That Matter Most ── */}
      <section className="border-t border-[#E8DFD1] bg-white/60">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="mb-10">
            <h2
              className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
              }}
            >
              The fees that matter most
            </h2>
            <p className="mt-2 text-[14px] text-[#8A8176]">
              National medians based on{" "}
              {stats.total_observations.toLocaleString()} fee observations.
              Updated {lastUpdated}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {heroEntries.map((entry) => (
              <Link
                key={entry!.fee_category}
                href={`/fees/${entry!.fee_category}`}
                className="group relative rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300 no-underline"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A09788]">
                  {getDisplayName(entry!.fee_category)}
                </p>
                <p className="mt-3 text-[2rem] font-bold tracking-tight text-[#1A1815] tabular-nums">
                  {formatAmount(entry!.median_amount)}
                </p>
                <p className="mt-1 text-[12px] text-[#A09788]">
                  national median
                </p>
                {entry!.p25_amount !== null && entry!.p75_amount !== null && (
                  <div className="mt-4 pt-4 border-t border-[#F0E8DC]">
                    <p className="text-[11px] text-[#B0A89C]">
                      Most banks charge between
                    </p>
                    <p className="text-[13px] font-semibold text-[#5A5347] tabular-nums">
                      {formatAmount(entry!.p25_amount)} &ndash;{" "}
                      {formatAmount(entry!.p75_amount)}
                    </p>
                  </div>
                )}
                <div className="absolute top-0 left-0 w-full h-[2px] rounded-t-xl bg-[#C44B2E]/0 group-hover:bg-[#C44B2E]/40 transition-all duration-300" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Research Insight: Banks vs Credit Unions ── */}
      {bankVsCu.length > 0 && (
        <section className="border-t border-[#E8DFD1]">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">
              <div className="lg:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#C44B2E]/60 mb-3">
                  Research Insight
                </p>
                <h2
                  className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815]"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  Banks vs. Credit Unions
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-[#7A7062]">
                  Credit unions are member-owned nonprofits, and that difference
                  shows up in the fee data. Here&apos;s how the median fees
                  compare across the two charter types.
                </p>
                <Link
                  href="/research/fee-revenue-analysis"
                  className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#C44B2E] hover:text-[#A93D25] transition-colors no-underline"
                >
                  View full analysis
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
              </div>

              <div className="lg:col-span-3 rounded-xl border border-[#E8DFD1] bg-white overflow-hidden">
                <div className="grid grid-cols-4 gap-0 px-5 py-2.5 border-b border-[#F0E8DC] bg-[#FAF7F2] text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  <span>Fee</span>
                  <span className="text-right">Bank</span>
                  <span className="text-right">Credit Union</span>
                  <span className="text-right">Difference</span>
                </div>
                {bankVsCu.map((row, i) => (
                  <div
                    key={row!.category}
                    className={`grid grid-cols-4 gap-0 px-5 py-3 text-[13px] ${
                      i < bankVsCu.length - 1
                        ? "border-b border-[#F5EFE6]"
                        : ""
                    }`}
                  >
                    <span className="font-medium text-[#3D3830]">
                      {getDisplayName(row!.category)}
                    </span>
                    <span className="text-right tabular-nums text-[#5A5347]">
                      {formatAmount(row!.bankMedian)}
                    </span>
                    <span className="text-right tabular-nums text-[#5A5347]">
                      {formatAmount(row!.cuMedian)}
                    </span>
                    <span
                      className={`text-right tabular-nums font-semibold ${
                        row!.diff > 0 ? "text-[#C44B2E]" : "text-emerald-700"
                      }`}
                    >
                      {row!.diff > 0 ? "+" : ""}
                      {formatAmount(row!.diff)}
                    </span>
                  </div>
                ))}
                <div className="px-5 py-2.5 border-t border-[#F0E8DC] bg-[#FAF7F2]">
                  <p className="text-[11px] text-[#B0A89C]">
                    Positive difference means banks charge more than credit
                    unions for that fee.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── By the Numbers ── */}
      {overdraftEntry && nsfEntry && maintenanceEntry && (
        <section className="border-t border-[#E8DFD1] bg-white/60">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#C44B2E]/60 mb-6">
              By the Numbers
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-xl border border-[#E8DFD1] bg-white p-6">
                <p
                  className="text-[2.5rem] font-bold tracking-tight text-[#1A1815] tabular-nums"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  {formatAmount(annualMaintenanceCost)}
                </p>
                <p className="mt-2 text-[13px] text-[#7A7062]">
                  Typical annual cost of monthly maintenance fees alone
                </p>
                <p className="mt-1 text-[11px] text-[#B0A89C]">
                  Based on {formatAmount(maintenanceEntry.median_amount)}/mo
                  median
                </p>
              </div>
              <div className="rounded-xl border border-[#E8DFD1] bg-white p-6">
                <p
                  className="text-[2.5rem] font-bold tracking-tight text-[#1A1815] tabular-nums"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  {formatAmount(overdraftEntry.max_amount ?? 0)}
                </p>
                <p className="mt-2 text-[13px] text-[#7A7062]">
                  The highest overdraft fee we&apos;ve found at a U.S. bank
                </p>
                <p className="mt-1 text-[11px] text-[#B0A89C]">
                  Median is {formatAmount(overdraftEntry.median_amount)},
                  range {formatAmount(overdraftEntry.p25_amount ?? 0)}&ndash;
                  {formatAmount(overdraftEntry.p75_amount ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-[#E8DFD1] bg-white p-6">
                <p
                  className="text-[2.5rem] font-bold tracking-tight text-[#1A1815] tabular-nums"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  {formatAmount(
                    (nsfEntry.median_amount ?? 0) +
                      (overdraftEntry.median_amount ?? 0)
                  )}
                </p>
                <p className="mt-2 text-[13px] text-[#7A7062]">
                  Combined cost of one overdraft + one bounced check
                </p>
                <p className="mt-1 text-[11px] text-[#B0A89C]">
                  NSF {formatAmount(nsfEntry.median_amount)} + Overdraft{" "}
                  {formatAmount(overdraftEntry.median_amount)}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── How Does Your Bank Compare? ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div>
              <h2
                className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                How does your bank compare?
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-[#7A7062]">
                We track {spotlightEntries.length} key fee categories across{" "}
                {stats.total_institutions.toLocaleString()} banks and credit
                unions. Search for your institution to see exactly where it
                stands.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/fees"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#C44B2E] hover:text-[#A93D25] transition-colors no-underline"
                >
                  Search all fees
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
              </div>
            </div>

            <div className="rounded-xl border border-[#E8DFD1] bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-[#F0E8DC] bg-[#FAF7F2]">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
                  Key Fee Benchmarks
                </p>
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {spotlightEntries.map((entry, i) => (
                    <tr
                      key={entry!.fee_category}
                      className={
                        i < spotlightEntries.length - 1
                          ? "border-b border-[#F5EFE6]"
                          : ""
                      }
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/fees/${entry!.fee_category}`}
                          className="font-medium text-[#3D3830] hover:text-[#C44B2E] transition-colors no-underline"
                        >
                          {getDisplayName(entry!.fee_category)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-[#1A1815] tabular-nums">
                        {formatAmount(entry!.median_amount)}
                      </td>
                      <td className="px-5 py-3 text-right text-[11px] text-[#B0A89C] tabular-nums">
                        {entry!.institution_count.toLocaleString()} banks
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── Fee Data by State ── */}
      {statesData.length > 0 && (
        <section className="border-t border-[#E8DFD1] bg-white/60">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#C44B2E]/60 mb-3">
                  Geographic Coverage
                </p>
                <h2
                  className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815]"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  Fee data by state
                </h2>
                <p className="mt-2 text-[14px] text-[#8A8176]">
                  We track fees in all 50 states. Here are the states with the
                  most institutional coverage.
                </p>
              </div>
              <Link
                href="/research"
                className="hidden sm:inline-flex text-[13px] font-semibold text-[#C44B2E] hover:text-[#A93D25] transition-colors no-underline"
              >
                All state reports
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {statesData.map((state) => (
                <Link
                  key={state.state_code}
                  href={`/research/state/${state.state_code}`}
                  className="group rounded-lg border border-[#E8DFD1] bg-white px-4 py-3 hover:border-[#C44B2E]/25 hover:shadow-sm transition-all no-underline"
                >
                  <p className="text-[18px] font-bold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                    {state.state_code}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#A09788] tabular-nums">
                    {state.institution_count.toLocaleString()} institutions
                  </p>
                  <p className="text-[11px] text-[#B0A89C] tabular-nums">
                    {state.fee_count.toLocaleString()} fees
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Consumer Guides ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2
                className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                Understanding your fees
              </h2>
              <p className="mt-2 text-[14px] text-[#8A8176]">
                Plain-language guides backed by real data.
              </p>
            </div>
            <Link
              href="/guides"
              className="hidden sm:inline-flex text-[13px] font-semibold text-[#C44B2E] hover:text-[#A93D25] transition-colors no-underline"
            >
              All guides
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {GUIDE_PREVIEWS.map((guide) => {
              const entry = allEntries.find(
                (e) => e.fee_category === guide.category
              );
              return (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="group rounded-xl border border-[#E8DFD1] bg-white p-5 hover:border-[#C44B2E]/25 hover:shadow-sm transition-all duration-300 no-underline"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                      {guide.title}
                    </h3>
                    {entry && (
                      <span className="shrink-0 text-[13px] font-bold text-[#C44B2E] tabular-nums">
                        {formatAmount(entry.median_amount)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#8A8176]">
                    {guide.desc}
                  </p>
                  <p className="mt-3 text-[11px] font-semibold text-[#C44B2E]/70 group-hover:text-[#C44B2E] transition-colors">
                    Read guide
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 sm:hidden">
            <Link
              href="/guides"
              className="text-[13px] font-semibold text-[#C44B2E] no-underline"
            >
              View all guides
            </Link>
          </div>
        </div>
      </section>

      {/* ── Explore More ── */}
      <section className="border-t border-[#E8DFD1] bg-white/60">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <h2
            className="text-[1.5rem] lg:text-[1.75rem] tracking-[-0.02em] text-[#1A1815] mb-8"
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
            }}
          >
            Go deeper
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Link
              href="/research/national-fee-index"
              className="group rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/25 hover:shadow-sm transition-all no-underline"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788] group-hover:text-[#C44B2E]/60 transition-colors">
                National Index
              </p>
              <p className="mt-2 text-[15px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                All {allEntries.length} fee categories
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                Full national median benchmarks with percentile ranges and
                institution counts.
              </p>
            </Link>
            <Link
              href="/research/fee-revenue-analysis"
              className="group rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/25 hover:shadow-sm transition-all no-underline"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788] group-hover:text-[#C44B2E]/60 transition-colors">
                Original Research
              </p>
              <p className="mt-2 text-[15px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                Fee-to-Revenue Analysis
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                How fee schedules correlate with bank service charge income
                across asset tiers.
              </p>
            </Link>
            <Link
              href="/research"
              className="group rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/25 hover:shadow-sm transition-all no-underline"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788] group-hover:text-[#C44B2E]/60 transition-colors">
                Research Hub
              </p>
              <p className="mt-2 text-[15px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                State & District Reports
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                Fee analysis by state, Fed district, and regulatory region with
                Beige Book context.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust & Data ── */}
      <section className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-[2rem] font-bold text-[#1A1815] tabular-nums">
                {stats.total_institutions.toLocaleString()}
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                Banks & credit unions
              </p>
            </div>
            <div>
              <p className="text-[2rem] font-bold text-[#1A1815] tabular-nums">
                {stats.total_observations.toLocaleString()}
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                Fee observations
              </p>
            </div>
            <div>
              <p className="text-[2rem] font-bold text-[#1A1815] tabular-nums">
                {stats.total_categories}
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                Fee categories
              </p>
            </div>
            <div>
              <p className="text-[2rem] font-bold text-[#1A1815] tabular-nums">
                50
              </p>
              <p className="mt-1 text-[12px] text-[#8A8176]">
                States covered
              </p>
            </div>
          </div>
          <div className="mt-10 text-center">
            <p className="text-[12px] text-[#B0A89C]">
              Data sourced from FDIC Call Reports, NCUA 5300 Reports, and
              publicly available fee schedules. Updated {lastUpdated}.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

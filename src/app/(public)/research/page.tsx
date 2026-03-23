export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getStatesWithFeeData,
  getDistrictMetrics,
  getStats,
  getDataFreshness,
  getFeeCategorySummaries,
} from "@/lib/crawler-db";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES, US_STATES_ONLY, US_TERRITORIES } from "@/lib/us-states";
import { UsStateMap } from "@/components/public/us-state-map";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Research - Bank & Credit Union Fee Analysis",
  description:
    "Geographic analysis of bank and credit union fees. State-level reports for all 50 states and Federal Reserve district analysis with economic context.",
};

const DISTRICT_ACCENTS: Record<number, string> = {
  1: "border-l-sky-400",
  2: "border-l-blue-500",
  3: "border-l-indigo-400",
  4: "border-l-violet-400",
  5: "border-l-purple-400",
  6: "border-l-rose-400",
  7: "border-l-amber-400",
  8: "border-l-orange-400",
  9: "border-l-teal-400",
  10: "border-l-emerald-400",
  11: "border-l-red-400",
  12: "border-l-cyan-400",
};

export default async function ResearchHubPage() {
  const statesData = await getStatesWithFeeData();
  const districtMetrics = await getDistrictMetrics();
  const stats = await getStats();
  const freshness = await getDataFreshness();
  const summaries = await getFeeCategorySummaries();

  const totalObservations = summaries.reduce((a, s) => a + s.total_observations, 0);
  const updateDate = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  // Separate states from territories for accurate display
  const stateCount = statesData.filter((s) => US_STATES_ONLY.has(s.state_code)).length;
  const territoryCount = statesData.filter((s) => US_TERRITORIES.has(s.state_code)).length;
  const stateLabel = territoryCount > 0
    ? `${stateCount} states + DC & territories`
    : `${stateCount} states`;

  // Spotlight fees for quick stats sidebar
  const spotlightKeys = ["overdraft", "nsf", "monthly_maintenance", "atm_non_network", "wire_domestic_outgoing", "card_foreign_txn"];
  const spotlightFees = spotlightKeys
    .map((k) => summaries.find((s) => s.fee_category === k))
    .filter(Boolean) as typeof summaries;

  // Top states by institution count for "chart preview" section
  const topStates = statesData.slice(0, 5);
  const maxStateInst = topStates.length > 0 ? topStates[0].institution_count : 1;

  // Total fees across all states
  const totalStateFees = statesData.reduce((a, s) => a + s.fee_count, 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
        ]}
      />

      {/* -- Hero -- */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="h-px w-8 bg-[#C44B2E]/40" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A09788]">
            Research Terminal
          </p>
        </div>
        <h1
          className="mt-1.5 text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] font-extrabold text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Fee Research & Analysis
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#7A7062]">
          The command center for US bank fee intelligence. State-level reports,
          Federal Reserve district analysis, and national benchmarking across
          every fee category.
        </p>

        {/* Authority strip */}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#A09788]">
          <span>
            <span className="font-semibold tabular-nums text-[#5A5347]">
              {totalObservations.toLocaleString()}
            </span>{" "}
            fee observations
          </span>
          <span className="hidden sm:inline text-[#D4C9BA]">|</span>
          <span>
            <span className="font-semibold tabular-nums text-[#5A5347]">
              {stats.total_institutions.toLocaleString()}
            </span>{" "}
            institutions
          </span>
          <span className="hidden sm:inline text-[#D4C9BA]">|</span>
          <span>
            <span className="font-semibold tabular-nums text-[#5A5347]">49</span>{" "}
            fee categories
          </span>
          <span className="hidden sm:inline text-[#D4C9BA]">|</span>
          <span>
            <span className="font-semibold tabular-nums text-[#5A5347]">
              {stateCount}
            </span>{" "}
            states{territoryCount > 0 ? ` + ${territoryCount} territories` : ""}
          </span>
          <span className="hidden sm:inline text-[#D4C9BA]">|</span>
          <span>12 Fed districts</span>
        </div>

        {/* Start here paths */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/guides"
            className="group rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm px-4 py-3.5 transition-all hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
              I&apos;m a Consumer
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
              Understand &amp; reduce my fees
            </p>
            <p className="mt-0.5 text-[11px] text-[#7A7062]">
              Plain-language guides with real data
            </p>
          </Link>
          <Link
            href="/research/national-fee-index"
            className="group rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm px-4 py-3.5 transition-all hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
              I&apos;m a Researcher
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
              National benchmarks &amp; data
            </p>
            <p className="mt-0.5 text-[11px] text-[#7A7062]">
              Medians, percentiles, geographic analysis
            </p>
          </Link>
          <Link
            href="/subscribe"
            className="group rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm px-4 py-3.5 transition-all hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
              I&apos;m a Professional
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
              Peer benchmarking &amp; API
            </p>
            <p className="mt-0.5 text-[11px] text-[#7A7062]">
              Custom analysis, exports, AI research
            </p>
          </Link>
        </div>
      </div>

      {/* -- Two-column layout -- */}
      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[1fr_300px]">
        {/* -- Main column -- */}
        <div className="min-w-0">
          {/* National Fee Index Hero Module */}
          <section id="national-index">
            <Link
              href="/research/national-fee-index"
              className="group block rounded-xl border-2 border-[#C44B2E]/20 bg-gradient-to-br from-[#FAF7F2] via-white to-[#FAF7F2]/50 px-6 py-6 transition-all hover:border-[#C44B2E]/30 hover:shadow-md hover:shadow-[#C44B2E]/5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#C44B2E]/60">
                    Core Product
                  </p>
                  <h2
                    className="mt-1 text-lg font-extrabold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors"
                    style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                  >
                    National Fee Index
                  </h2>
                  <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-[#7A7062]">
                    The definitive benchmark of US bank and credit union fees.
                    Medians, percentiles, and charter comparisons
                    across every fee category.
                  </p>
                </div>
                <svg
                  className="mt-1 h-8 w-8 shrink-0 text-[#C44B2E]/40 group-hover:text-[#C44B2E]/60 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[#E8DFD1]/60 pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C44B2E]/60">
                    Categories
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-[#1A1815]">
                    49
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C44B2E]/60">
                    Observations
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-[#1A1815]">
                    {totalObservations.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C44B2E]/60">
                    Updated
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-[#1A1815]">
                    {updateDate ?? "---"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <span className="text-[12px] font-semibold text-[#C44B2E] group-hover:text-[#C44B2E] transition-colors">
                  Open Index
                </span>
                <span className="text-[11px] text-[#C44B2E]/60">View Benchmarks</span>
                <svg className="h-4 w-4 text-[#C44B2E]/60 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </Link>
          </section>

          {/* Analysis Previews -- mini bar charts */}
          <section className="mt-8" id="analysis">
            <h2
              className="text-sm font-bold text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Analysis Previews
            </h2>
            <p className="mt-1 text-[13px] text-[#A09788]">
              Top states by institution coverage and key fee benchmarks.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Top states bar chart */}
              <div className="rounded-xl border border-[#E8DFD1]/80 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
                  Institutions by State (Top 5)
                </p>
                <div className="mt-3 space-y-2">
                  {topStates.map((s) => {
                    const pct = (s.institution_count / maxStateInst) * 100;
                    return (
                      <div key={s.state_code} className="flex items-center gap-2">
                        <span className="w-6 text-[11px] font-semibold text-[#7A7062]">
                          {s.state_code}
                        </span>
                        <div className="flex-1 h-4 rounded-sm bg-[#E8DFD1]/40 overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-[#D4C9BA]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[11px] tabular-nums font-medium text-[#7A7062]">
                          {s.institution_count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Spotlight fee comparison */}
              <div className="rounded-xl border border-[#E8DFD1]/80 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
                  National Fee Medians
                </p>
                <div className="mt-3 space-y-2">
                  {spotlightFees.slice(0, 5).map((fee) => {
                    const maxMedian = Math.max(...spotlightFees.map((f) => f.median_amount ?? 0));
                    const pct = maxMedian > 0 ? ((fee.median_amount ?? 0) / maxMedian) * 100 : 0;
                    return (
                      <div key={fee.fee_category} className="flex items-center gap-2">
                        <span className="w-20 truncate text-[11px] text-[#7A7062]">
                          {getDisplayName(fee.fee_category).split(" ").slice(0, 2).join(" ")}
                        </span>
                        <div className="flex-1 h-4 rounded-sm bg-[#E8DFD1]/40 overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-[#C44B2E]/40"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-[11px] tabular-nums font-semibold text-[#5A5347]">
                          {formatAmount(fee.median_amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* State Reports */}
          <section className="mt-10" id="states">
            <div className="flex items-baseline justify-between">
              <div>
                <h2
                  className="text-sm font-bold text-[#1A1815]"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  State Fee Reports
                </h2>
                <p className="mt-1 text-[13px] text-[#A09788]">
                  {stateLabel} &middot;{" "}
                  {totalStateFees.toLocaleString()} fees extracted
                </p>
              </div>
            </div>

            {/* Interactive map */}
            <div className="mt-4 rounded-xl border border-[#E8DFD1]/80 bg-white/70 backdrop-blur-sm p-4">
              <UsStateMap statesData={statesData} />
              <p className="mt-2 text-center text-[11px] text-[#A09788]">
                Click a state to view its fee report
              </p>
            </div>

            {/* Compact state list below map */}
            <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {statesData.map((s) => (
                <Link
                  key={s.state_code}
                  href={`/research/state/${s.state_code}`}
                  className="flex items-baseline justify-between rounded px-2 py-1 text-[11px] transition-colors hover:bg-[#FAF7F2]"
                >
                  <span className="font-medium text-[#5A5347] hover:text-[#C44B2E] truncate">
                    {STATE_NAMES[s.state_code] ?? s.state_code}
                  </span>
                  <span className="ml-1 tabular-nums text-[#A09788] shrink-0">
                    {s.institution_count}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Federal Reserve District Reports */}
          <section className="mt-10" id="districts">
            <h2
              className="text-sm font-bold text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Federal Reserve District Reports
            </h2>
            <p className="mt-1 text-[13px] text-[#A09788]">
              Fee analysis across all 12 Federal Reserve districts with
              economic context from the Beige Book.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {districtMetrics.map((d) => {
                const accent = DISTRICT_ACCENTS[d.district] ?? "border-l-[#D4C9BA]";
                return (
                  <Link
                    key={d.district}
                    href={`/research/district/${d.district}`}
                    className={`group rounded-xl border border-[#E8DFD1]/80 ${accent} border-l-[3px] px-4 py-3.5 transition-all hover:border-[#E8DFD1] hover:shadow-md hover:shadow-[#C44B2E]/5`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8DFD1]/40 text-[10px] font-bold text-[#7A7062]">
                        {d.district}
                      </span>
                      <span className="text-sm font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                        {DISTRICT_NAMES[d.district]}
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-[#A09788]">Institutions</p>
                        <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                          {d.institution_count.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#A09788]">Fees</p>
                        <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                          {d.total_fees.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#A09788]">Coverage</p>
                        <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                          {Math.round(d.fee_url_pct * 100)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end">
                      <span className="text-[11px] font-medium text-[#C44B2E] opacity-0 group-hover:opacity-100 transition-opacity">
                        View report &rarr;
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Original Research */}
          <section className="mt-10" id="original-research">
            <h2
              className="text-sm font-bold text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Original Research
            </h2>
            <p className="mt-1 text-[13px] text-[#A09788]">
              In-depth studies and analysis on US bank fee structures.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                href="/research/fee-revenue-analysis"
                className="group flex flex-col rounded-xl border border-[#E8DFD1]/80 px-5 py-4 transition-all hover:border-[#C44B2E]/20 hover:bg-[#FAF7F2] hover:shadow-md hover:shadow-[#C44B2E]/5"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#A09788] group-hover:text-[#C44B2E] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75"
                    />
                  </svg>
                  <div>
                    <span className="text-sm font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                      Fee-to-Revenue Analysis
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-[#7A7062]">
                      How published fee schedules correlate with service charge
                      income reported in FDIC call reports.
                    </span>
                  </div>
                </div>
                <span className="mt-3 self-end text-[11px] font-medium text-[#C44B2E] opacity-0 group-hover:opacity-100 transition-opacity">
                  View study &rarr;
                </span>
              </Link>

              <Link
                href="/research/market-concentration"
                className="group flex flex-col rounded-xl border border-[#E8DFD1]/80 px-5 py-4 transition-all hover:border-[#C44B2E]/20 hover:bg-[#FAF7F2] hover:shadow-md hover:shadow-[#C44B2E]/5"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#A09788] group-hover:text-[#C44B2E] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
                    />
                  </svg>
                  <div>
                    <span className="text-sm font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                      Market Concentration & Fees
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-[#7A7062]">
                      HHI analysis of deposit market competition across U.S. metro
                      areas using FDIC Summary of Deposits data.
                    </span>
                  </div>
                </div>
                <span className="mt-3 self-end text-[11px] font-medium text-[#C44B2E] opacity-0 group-hover:opacity-100 transition-opacity">
                  View study &rarr;
                </span>
              </Link>

              <Link
                href="/guides"
                className="group flex flex-col rounded-xl border border-[#E8DFD1]/80 px-5 py-4 transition-all hover:border-[#C44B2E]/20 hover:bg-[#FAF7F2] hover:shadow-md hover:shadow-[#C44B2E]/5"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#A09788] group-hover:text-[#C44B2E] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                  <div>
                    <span className="text-sm font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                      Consumer Guides
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-[#7A7062]">
                      Plain-language guides to understanding overdraft, NSF, ATM,
                      wire transfer, and maintenance fees with live benchmarks.
                    </span>
                  </div>
                </div>
                <span className="mt-3 self-end text-[11px] font-medium text-[#C44B2E] opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse guides &rarr;
                </span>
              </Link>
            </div>
          </section>

          {/* Data Sources & Authority */}
          <section className="mt-10" id="methodology">
            <div className="rounded-xl border border-[#E8DFD1]/80 bg-[#FAF7F2]/60 px-6 py-5">
              <h2
                className="text-sm font-bold text-[#5A5347]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Data Sources & Methodology
              </h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
                    Primary Sources
                  </p>
                  <ul className="space-y-1.5 text-[13px] text-[#7A7062]">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                      Published fee schedules & disclosures
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                      FDIC Call Reports (service charge income)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                      NCUA 5300 reports (credit union data)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                      Federal Reserve Beige Book (economic context)
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
                    Coverage
                  </p>
                  <ul className="space-y-1.5 text-[13px] text-[#7A7062]">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      Banks and credit unions
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      All asset size tiers
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      All 12 Federal Reserve districts
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {stateLabel}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* -- Sidebar -- */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-5">
            {/* Navigation */}
            <nav className="rounded-xl border border-[#E8DFD1]/80 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-3">
                Research
              </p>
              <ul className="space-y-1.5">
                {[
                  { label: "National Index", href: "#national-index" },
                  { label: "Analysis Previews", href: "#analysis" },
                  { label: "State Reports", href: "#states" },
                  { label: "Fed Districts", href: "#districts" },
                  { label: "Original Research", href: "#original-research" },
                  { label: "Methodology", href: "#methodology" },
                ].map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block rounded px-2 py-1 text-[12px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#5A5347] transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Quick Stats */}
            <div className="rounded-xl border border-[#E8DFD1]/80 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-3">
                Quick Stats
              </p>
              <div className="space-y-3">
                {spotlightFees.slice(0, 4).map((fee) => (
                  <div key={fee.fee_category}>
                    <p className="text-[11px] text-[#A09788]">
                      {getDisplayName(fee.fee_category)}
                    </p>
                    <p className="text-sm font-bold tabular-nums text-[#1A1815]">
                      {formatAmount(fee.median_amount)}
                    </p>
                    {fee.p25_amount != null && fee.p75_amount != null && (
                      <p className="text-[10px] tabular-nums text-[#A09788]">
                        P25 {formatAmount(fee.p25_amount)} &middot; P75{" "}
                        {formatAmount(fee.p75_amount)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Explore links */}
            <div className="rounded-xl border border-[#E8DFD1]/80 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-3">
                Explore
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/fees"
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#C44B2E] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                    All 49 Fee Categories
                  </Link>
                </li>
                <li>
                  <Link
                    href="/research/national-fee-index"
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#C44B2E] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                    </svg>
                    National Benchmarks
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides"
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#C44B2E] transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25v14.25" />
                    </svg>
                    Consumer Guides
                  </Link>
                </li>
              </ul>
            </div>

            {/* Professional CTA */}
            <div className="rounded-xl border border-[#1A1815] bg-[#1A1815] px-4 py-4 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
                Pro
              </p>
              <p className="mt-1.5 text-[13px] font-semibold text-white">
                Professional research tools
              </p>
              <ul className="mt-2.5 space-y-1.5 text-[12px] text-[#A09788]">
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-emerald-400">&#10003;</span>
                  Custom peer group analysis
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-emerald-400">&#10003;</span>
                  FDIC/NCUA financial data
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-emerald-400">&#10003;</span>
                  AI-powered fee analyst
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-emerald-400">&#10003;</span>
                  CSV exports &amp; API access
                </li>
              </ul>
              <Link
                href="/subscribe"
                className="mt-3 block rounded-md bg-[#C44B2E] px-3 py-2 text-center text-[12px] font-semibold text-white no-underline hover:bg-[#A83D25] transition-colors"
              >
                View Plans
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Bank Fee Research Reports",
            description:
              "Geographic analysis of bank and credit union fees across all 50 US states and 12 Federal Reserve districts.",
            url: `${SITE_URL}/research`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

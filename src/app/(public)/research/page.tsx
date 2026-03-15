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

export default function ResearchHubPage() {
  const statesData = getStatesWithFeeData();
  const districtMetrics = getDistrictMetrics();
  const stats = getStats();
  const freshness = getDataFreshness();
  const summaries = getFeeCategorySummaries();

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
    <div className="mx-auto max-w-7xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
        ]}
      />

      {/* ── Hero ── */}
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
          Research Terminal
        </p>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900">
          Fee Research & Analysis
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500">
          The command center for US bank fee intelligence. State-level reports,
          Federal Reserve district analysis, and national benchmarking across
          every fee category.
        </p>

        {/* Authority strip */}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-400">
          <span>
            <span className="font-semibold tabular-nums text-slate-700">
              {totalObservations.toLocaleString()}
            </span>{" "}
            fee observations
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>
            <span className="font-semibold tabular-nums text-slate-700">
              {stats.total_institutions.toLocaleString()}
            </span>{" "}
            institutions
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>
            <span className="font-semibold tabular-nums text-slate-700">49</span>{" "}
            fee categories
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>
            <span className="font-semibold tabular-nums text-slate-700">
              {stateCount}
            </span>{" "}
            states{territoryCount > 0 ? ` + ${territoryCount} territories` : ""}
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>12 Fed districts</span>
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/fees"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Search Fees
          </Link>
          <Link
            href="/research/national-fee-index"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            View Index
          </Link>
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Consumer Guides
          </Link>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[1fr_300px]">
        {/* ── Main column ── */}
        <div className="min-w-0">
          {/* National Fee Index Hero Module */}
          <section id="national-index">
            <Link
              href="/research/national-fee-index"
              className="group block rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-blue-50/30 px-6 py-6 transition-all hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-400">
                    Core Product
                  </p>
                  <h2 className="mt-1 text-lg font-extrabold text-blue-900 group-hover:text-blue-700 transition-colors">
                    National Fee Index
                  </h2>
                  <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-blue-700/60">
                    The definitive benchmark of US bank and credit union fees.
                    Medians, percentiles, maturity scores, and charter comparisons
                    across every category.
                  </p>
                </div>
                <svg
                  className="mt-1 h-8 w-8 shrink-0 text-blue-300 group-hover:text-blue-400 transition-colors"
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

              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-blue-100 pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    Categories
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-blue-900">
                    49
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    Observations
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-blue-900">
                    {totalObservations.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    Updated
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-blue-900">
                    {updateDate ?? "---"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <span className="text-[12px] font-semibold text-blue-600 group-hover:text-blue-700 transition-colors">
                  Open Index
                </span>
                <span className="text-[11px] text-blue-400">View Benchmarks</span>
                <svg className="h-4 w-4 text-blue-400 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </Link>
          </section>

          {/* Analysis Previews — mini bar charts */}
          <section className="mt-8" id="analysis">
            <h2 className="text-sm font-bold text-slate-800">Analysis Previews</h2>
            <p className="mt-1 text-[13px] text-slate-400">
              Top states by institution coverage and key fee benchmarks.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Top states bar chart */}
              <div className="rounded-lg border border-slate-200 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Institutions by State (Top 5)
                </p>
                <div className="mt-3 space-y-2">
                  {topStates.map((s) => {
                    const pct = (s.institution_count / maxStateInst) * 100;
                    return (
                      <div key={s.state_code} className="flex items-center gap-2">
                        <span className="w-6 text-[11px] font-semibold text-slate-500">
                          {s.state_code}
                        </span>
                        <div className="flex-1 h-4 rounded-sm bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-slate-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[11px] tabular-nums font-medium text-slate-600">
                          {s.institution_count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Spotlight fee comparison */}
              <div className="rounded-lg border border-slate-200 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  National Fee Medians
                </p>
                <div className="mt-3 space-y-2">
                  {spotlightFees.slice(0, 5).map((fee) => {
                    const maxMedian = Math.max(...spotlightFees.map((f) => f.median_amount ?? 0));
                    const pct = maxMedian > 0 ? ((fee.median_amount ?? 0) / maxMedian) * 100 : 0;
                    return (
                      <div key={fee.fee_category} className="flex items-center gap-2">
                        <span className="w-20 truncate text-[11px] text-slate-500">
                          {getDisplayName(fee.fee_category).split(" ").slice(0, 2).join(" ")}
                        </span>
                        <div className="flex-1 h-4 rounded-sm bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-blue-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-[11px] tabular-nums font-semibold text-slate-700">
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
                <h2 className="text-sm font-bold text-slate-800">
                  State Fee Reports
                </h2>
                <p className="mt-1 text-[13px] text-slate-400">
                  {stateLabel} &middot;{" "}
                  {totalStateFees.toLocaleString()} fees extracted
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {statesData.map((s) => (
                <Link
                  key={s.state_code}
                  href={`/research/state/${s.state_code}`}
                  className="group rounded-lg border border-slate-200 px-3.5 py-3 transition-all hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {STATE_NAMES[s.state_code] ?? s.state_code}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-300">
                      {s.state_code}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{s.institution_count.toLocaleString()} inst.</span>
                    <span>{s.fee_count.toLocaleString()} fees</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Federal Reserve District Reports */}
          <section className="mt-10" id="districts">
            <h2 className="text-sm font-bold text-slate-800">
              Federal Reserve District Reports
            </h2>
            <p className="mt-1 text-[13px] text-slate-400">
              Fee analysis across all 12 Federal Reserve districts with
              economic context from the Beige Book.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {districtMetrics.map((d) => {
                const accent = DISTRICT_ACCENTS[d.district] ?? "border-l-slate-300";
                return (
                  <Link
                    key={d.district}
                    href={`/research/district/${d.district}`}
                    className={`group rounded-lg border border-slate-200 ${accent} border-l-[3px] px-4 py-3.5 transition-all hover:border-slate-300 hover:shadow-sm`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                        {d.district}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {DISTRICT_NAMES[d.district]}
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400">Institutions</p>
                        <p className="text-[13px] font-semibold tabular-nums text-slate-700">
                          {d.institution_count.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Fees</p>
                        <p className="text-[13px] font-semibold tabular-nums text-slate-700">
                          {d.total_fees.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Coverage</p>
                        <p className="text-[13px] font-semibold tabular-nums text-slate-700">
                          {Math.round(d.fee_url_pct * 100)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end">
                      <span className="text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <h2 className="text-sm font-bold text-slate-800">
              Original Research
            </h2>
            <p className="mt-1 text-[13px] text-slate-400">
              In-depth studies and analysis on US bank fee structures.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                href="/research/fee-revenue-analysis"
                className="group flex flex-col rounded-lg border border-slate-200 px-5 py-4 transition-all hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-slate-400 group-hover:text-blue-500 transition-colors"
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
                    <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Fee-to-Revenue Analysis
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">
                      How published fee schedules correlate with service charge
                      income reported in FDIC call reports.
                    </span>
                  </div>
                </div>
                <span className="mt-3 self-end text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  View study &rarr;
                </span>
              </Link>

              <Link
                href="/guides"
                className="group flex flex-col rounded-lg border border-slate-200 px-5 py-4 transition-all hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-slate-400 group-hover:text-blue-500 transition-colors"
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
                    <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Consumer Guides
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">
                      Plain-language guides to understanding overdraft, NSF, ATM,
                      wire transfer, and maintenance fees with live benchmarks.
                    </span>
                  </div>
                </div>
                <span className="mt-3 self-end text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse guides &rarr;
                </span>
              </Link>
            </div>
          </section>

          {/* Data Sources & Authority */}
          <section className="mt-10" id="methodology">
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 px-6 py-5">
              <h2 className="text-sm font-bold text-slate-700">
                Data Sources & Methodology
              </h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Primary Sources
                  </p>
                  <ul className="space-y-1.5 text-[13px] text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                      Published fee schedules & disclosures
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                      FDIC Call Reports (service charge income)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                      NCUA 5300 reports (credit union data)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                      Federal Reserve Beige Book (economic context)
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Coverage
                  </p>
                  <ul className="space-y-1.5 text-[13px] text-slate-600">
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

        {/* ── Sidebar ── */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-5">
            {/* Navigation */}
            <nav className="rounded-lg border border-slate-200 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
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
                      className="block rounded px-2 py-1 text-[12px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Quick Stats */}
            <div className="rounded-lg border border-slate-200 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Quick Stats
              </p>
              <div className="space-y-3">
                {spotlightFees.slice(0, 4).map((fee) => (
                  <div key={fee.fee_category}>
                    <p className="text-[11px] text-slate-400">
                      {getDisplayName(fee.fee_category)}
                    </p>
                    <p className="text-sm font-bold tabular-nums text-slate-800">
                      {formatAmount(fee.median_amount)}
                    </p>
                    {fee.p25_amount != null && fee.p75_amount != null && (
                      <p className="text-[10px] tabular-nums text-slate-400">
                        P25 {formatAmount(fee.p25_amount)} &middot; P75{" "}
                        {formatAmount(fee.p75_amount)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Explore links */}
            <div className="rounded-lg border border-slate-200 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Explore
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/fees"
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
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
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
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
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
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
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-4 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                For Professionals
              </p>
              <p className="mt-1.5 text-[13px] font-semibold text-white">
                Need custom analysis?
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                Custom peer groups, historical trends, and competitive
                benchmarking for financial institutions.
              </p>
              <div className="mt-3 rounded-md bg-white/10 px-3 py-2 text-center text-[12px] font-semibold text-white">
                Coming Soon
              </div>
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

import { cacheLife } from "next/cache";
import Link from "next/link";
import { getNationalIndex } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

const INDEX_CATEGORIES = [
  "monthly_maintenance",
  "nsf",
  "overdraft",
  "atm_non_network",
  "wire_domestic_outgoing",
  "card_foreign_txn",
  "stop_payment",
  "cashiers_check",
];

const TIERS = [
  "Community (<$300M)",
  "Community ($300M-$1B)",
  "Regional ($1B-$10B)",
  "Large Regional ($10B+)",
];

export default async function LandingPage() {
  "use cache";
  cacheLife("hours");
  const allEntries = getNationalIndex();
  const snapshotEntries = INDEX_CATEGORIES.map((cat) =>
    allEntries.find((e) => e.fee_category === cat)
  ).filter(Boolean);

  const totalInstitutions = Math.max(
    ...allEntries.map((e) => e.institution_count),
    0
  );
  const totalCategories = allEntries.length;

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5 text-amber-400"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 17l4-8 4 5 4-10 6 13" />
            </svg>
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Bank Fee Index
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#national-index"
              className="text-[13px] text-slate-400 hover:text-white transition-colors"
            >
              National Index
            </a>
            <a
              href="#peer-index"
              className="text-[13px] text-slate-400 hover:text-white transition-colors"
            >
              Peer Index
            </a>
            <a
              href="#methodology"
              className="text-[13px] text-slate-400 hover:text-white transition-colors"
            >
              Methodology
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              href="#request-access"
              className="hidden sm:inline-flex rounded border border-amber-400/80 px-3.5 py-1.5 text-[13px] font-medium text-amber-400 hover:bg-amber-400/10 transition-colors"
            >
              Request Access
            </a>
            <Link
              href="/admin/login"
              className="text-[13px] text-slate-500 hover:text-white transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ========== SECTION 1: Hero ========== */}
      <section className="relative overflow-hidden bg-[#0f172a] pt-14">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left: Copy */}
            <div>
              <h1 className="text-[2.75rem] md:text-[3.25rem] leading-[1.08] font-light tracking-tight text-white">
                The National
                <br />
                Benchmark for
                <br />
                <span className="font-normal">Retail Banking Fees.</span>
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">
                Compare your institution&apos;s pricing against validated
                national and peer-level fee indexes derived from thousands of
                U.S. financial institutions.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-[13px] text-slate-500">
                <span>
                  <span className="font-semibold text-white tabular-nums">
                    8,751
                  </span>{" "}
                  institutions
                </span>
                <span>
                  <span className="font-semibold text-white tabular-nums">
                    4,000+
                  </span>{" "}
                  validated schedules
                </span>
                <span>
                  <span className="font-semibold text-white tabular-nums">
                    47
                  </span>{" "}
                  fee categories
                </span>
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <a
                  href="#request-access"
                  className="inline-flex items-center rounded bg-amber-400 px-5 py-2.5 text-[13px] font-semibold text-[#0f172a] hover:bg-amber-300 transition-colors"
                >
                  Request Institutional Access
                </a>
                <a
                  href="#national-index"
                  className="inline-flex items-center rounded border border-slate-600 px-5 py-2.5 text-[13px] font-medium text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
                >
                  View National Index
                </a>
              </div>
            </div>

            {/* Right: Index Preview Card */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700/50">
                <p className="text-[13px] font-semibold text-white tracking-wide">
                  The National Bank Fee Index
                </p>
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {snapshotEntries.slice(0, 4).map((entry, i) => (
                    <tr
                      key={entry!.fee_category}
                      className={
                        i < 3 ? "border-b border-slate-700/30" : ""
                      }
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-200">
                          {getDisplayName(entry!.fee_category)}
                        </span>
                        <br />
                        <span className="text-[11px] text-slate-500">
                          National Median
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-white tabular-nums text-base">
                          {formatAmount(entry!.median_amount)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-slate-400 tabular-nums">
                          {entry!.institution_count.toLocaleString()}
                        </span>
                        <br />
                        <span className="text-[11px] text-slate-600">
                          institutions
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-slate-700/30 flex items-center justify-between">
                <span className="text-[11px] text-slate-600">
                  Last Updated: February 2026
                </span>
                <a
                  href="#national-index"
                  className="text-[12px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Explore Peer Index &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
        {/* Bottom fade */}
        <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
      </section>

      {/* ========== SECTION 2: What Is the Bank Fee Index? ========== */}
      <section className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                What Is the Bank Fee Index?
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
                The Bank Fee Index aggregates publicly available fee schedules
                from U.S. banks and credit unions and calculates validated
                median benchmarks across standardized fee categories,
                including:
              </p>
              <ul className="mt-5 space-y-2 text-[15px] text-slate-600">
                {[
                  "Monthly maintenance",
                  "Non-sufficient funds (NSF)",
                  "Overdraft",
                  "ATM out-of-network",
                  "Wire transfer fees",
                  "Account service fees",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[13px] font-medium text-slate-500 border-l-2 border-amber-400 pl-4">
                Only approved and validated data is included in index
                calculations.
              </p>
            </div>

            {/* National vs Peer graphic */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f172a]">
                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 3v18" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    National Index
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    All Institutions
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Validated Median Calculations
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f172a]">
                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 3v18M3 12h18" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    Peer Index
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Filtered by Asset Size,
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Fed District, and Charter Type
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="italic">vs</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <p className="mt-4 text-center text-[13px] text-slate-500">
                Segment by peer characteristics to generate tailored benchmarks
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SECTION 3: National Index Snapshot ========== */}
      <section
        id="national-index"
        className="bg-slate-50 border-y border-slate-200 py-20 md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              National Index Snapshot
            </h2>
            <p className="mt-3 text-[15px] text-slate-500 max-w-xl mx-auto">
              Validated median benchmarks across{" "}
              {totalCategories} standardized fee categories.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    National Median
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    P25 &ndash; P75
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Contributing Institutions
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshotEntries.map((entry, i) => (
                  <tr
                    key={entry!.fee_category}
                    className={
                      i < snapshotEntries.length - 1
                        ? "border-b border-slate-100"
                        : ""
                    }
                  >
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {getDisplayName(entry!.fee_category)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold text-slate-900 tabular-nums">
                      {formatAmount(entry!.median_amount)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-500 tabular-nums text-xs">
                      {entry!.p25_amount !== null && entry!.p75_amount !== null
                        ? `${formatAmount(entry!.p25_amount)} - ${formatAmount(entry!.p75_amount)}`
                        : "-"}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-600 tabular-nums">
                      {entry!.institution_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Last updated: February 2026 &middot; {totalCategories}{" "}
                categories indexed
              </span>
              <a
                href="#peer-index"
                className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                Explore Peer Index &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SECTION 4: Peer Index Segmentation ========== */}
      <section id="peer-index" className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                Peer Index Segmentation
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
                Generate a tailored benchmark using asset tier, Federal Reserve
                district, and charter type to reflect your institution&apos;s
                competitive footprint.
              </p>
              <div className="mt-8 space-y-4">
                <div className="rounded border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Asset Tier
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TIERS.map((tier) => (
                      <span
                        key={tier}
                        className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {tier}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Federal Reserve District
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Boston",
                      "New York",
                      "Philadelphia",
                      "Cleveland",
                      "Richmond",
                      "Atlanta",
                      "Chicago",
                      "St. Louis",
                      "Minneapolis",
                      "Kansas City",
                      "Dallas",
                      "San Francisco",
                    ].map((d) => (
                      <span
                        key={d}
                        className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Charter Type
                  </p>
                  <div className="flex gap-2">
                    <span className="rounded bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700">
                      Banks
                    </span>
                    <span className="rounded bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700">
                      Credit Unions
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-8">
                <a
                  href="#request-access"
                  className="inline-flex items-center rounded bg-[#0f172a] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Benchmark Your Institution
                </a>
              </div>
            </div>

            {/* Peer comparison preview */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-white">
                <p className="text-[13px] font-semibold text-slate-900">
                  Sample Peer Comparison
                </p>
                <p className="text-[11px] text-slate-500">
                  Community Banks (&lt;$300M) &middot; District 7 - Chicago
                </p>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-5 py-2.5 text-xs font-medium text-slate-500">
                      Category
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">
                      Peer Median
                    </th>
                    <th className="px-5 py-2.5 text-xs font-medium text-slate-500 text-right">
                      National
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {snapshotEntries.slice(0, 5).map((entry, i) => {
                    // Deterministic peer offset based on category index
                    const offsets = [0.93, 1.07, 0.88, 1.02, 0.95];
                    const peerDelta = entry!.median_amount
                      ? entry!.median_amount * offsets[i]
                      : null;
                    return (
                      <tr
                        key={entry!.fee_category}
                        className={
                          i < 4 ? "border-b border-slate-100" : ""
                        }
                      >
                        <td className="px-5 py-2.5 text-slate-700">
                          {getDisplayName(entry!.fee_category)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                          {peerDelta ? formatAmount(Math.round(peerDelta * 100) / 100) : "-"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">
                          {formatAmount(entry!.median_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50">
                <p className="text-[11px] text-slate-400">
                  Illustrative data. Actual peer medians computed from validated submissions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SECTION 5: Institutional Comparison ========== */}
      <section className="bg-[#0f172a] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Institutional Comparison
            </h2>
            <p className="mt-3 text-[15px] text-slate-400 max-w-lg mx-auto">
              Understand whether your institution&apos;s pricing aligns with
              peer medians or diverges from national benchmarks.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-700/40 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-slate-500">
                    Category
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-amber-400 text-right">
                    Your Fee
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">
                    Peer Median
                  </th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 text-right">
                    National Median
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700/30">
                  <td className="px-5 py-3 text-slate-300">NSF</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-400">
                    $34.00
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                    $31.00
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    $32.50
                  </td>
                </tr>
                <tr className="border-b border-slate-700/30">
                  <td className="px-5 py-3 text-slate-300">Overdraft</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-400">
                    $28.00
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                    $30.00
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    $30.00
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-slate-300">
                    Monthly Maintenance
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-400">
                    $8.95
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                    $7.00
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    $6.82
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-center mt-8">
            <a
              href="#request-access"
              className="inline-flex items-center rounded bg-amber-400 px-5 py-2.5 text-[13px] font-semibold text-[#0f172a] hover:bg-amber-300 transition-colors"
            >
              Request Comparative Analysis
            </a>
          </div>
        </div>
      </section>

      {/* ========== SECTION 6: Methodology ========== */}
      <section id="methodology" className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              Methodology &amp; Data Integrity
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
              The Bank Fee Index is built on publicly available data processed
              through a structured validation pipeline.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Public Sources",
                desc: "Fee schedules collected from publicly available institution websites and regulatory filings.",
              },
              {
                title: "Structured Extraction",
                desc: "Automated extraction with human validation. Each fee is categorized into one of 47 standardized categories.",
              },
              {
                title: "Validation Workflow",
                desc: "Multi-stage review: pending, staged, approved. Only validated data enters index calculations.",
              },
              {
                title: "Median-Based Calculations",
                desc: "Medians are used as the primary metric to minimize the impact of outliers and skewed distributions.",
              },
              {
                title: "Percentile Ranges",
                desc: "P25 and P75 ranges provide context for the spread of fees within each category.",
              },
              {
                title: "Regular Updates",
                desc: "Fee schedules are re-crawled on a rolling basis. Index calculations reflect the latest validated data.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded border border-slate-200 p-5"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SECTION 7: Who Uses ========== */}
      <section className="bg-slate-50 border-y border-slate-200 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl text-center mb-12">
            Who Uses the Bank Fee Index
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                type: "Community Banks",
                desc: "Evaluate pricing against similar asset-tier peers.",
              },
              {
                type: "Regional Banks",
                desc: "Assess district-level competitive positioning.",
              },
              {
                type: "Credit Unions",
                desc: "Benchmark fee structures across charter segments.",
              },
              {
                type: "Consultants",
                desc: "Support pricing strategy engagements with validated data.",
              },
            ].map((item) => (
              <div
                key={item.type}
                className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.type}
                  </p>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SECTION 8: Request Access ========== */}
      <section
        id="request-access"
        className="bg-[#0f172a] py-20 md:py-28"
      >
        <div className="mx-auto max-w-xl px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Request Access to the Bank Fee Index
            </h2>
            <p className="mt-3 text-[15px] text-slate-400">
              All inquiries are reviewed. Access is limited to institutional
              users.
            </p>
          </div>
          <form
            action="/api/request-access"
            method="POST"
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Institution
              </label>
              <input
                type="text"
                name="institution"
                required
                className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Asset Size Tier
                </label>
                <select
                  name="asset_tier"
                  required
                  className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                >
                  <option value="">Select tier</option>
                  <option value="under_300m">Under $300M</option>
                  <option value="300m_1b">$300M - $1B</option>
                  <option value="1b_10b">$1B - $10B</option>
                  <option value="over_10b">Over $10B</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Primary Interest
              </label>
              <select
                name="interest"
                required
                className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
              >
                <option value="">Select interest</option>
                <option value="peer_benchmark">Peer Benchmark</option>
                <option value="full_index">Full Index Access</option>
                <option value="comparison">
                  Institutional Comparison
                </option>
                <option value="api">API Access</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded bg-amber-400 py-3 text-[13px] font-semibold text-[#0f172a] hover:bg-amber-300 transition-colors mt-2"
            >
              Submit Request
            </button>
          </form>
        </div>
      </section>

      {/* ========== SECTION 9: Footer ========== */}
      <footer className="bg-[#0b1120] py-12 border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-amber-400"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 17l4-8 4 5 4-10 6 13" />
                </svg>
                <span className="text-sm font-semibold text-white">
                  Bank Fee Index
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 max-w-md">
                Bank Fee Index is an independent benchmarking platform derived
                from publicly available fee schedules. It is not affiliated
                with the Federal Reserve or any regulatory authority.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              <a href="#methodology" className="hover:text-slate-300 transition-colors">
                Methodology
              </a>
              <a href="#national-index" className="hover:text-slate-300 transition-colors">
                National Index
              </a>
              <a href="#request-access" className="hover:text-slate-300 transition-colors">
                Contact
              </a>
              <span className="text-slate-700">Privacy Policy</span>
            </nav>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-[11px] text-slate-600">
              &copy; {new Date().getFullYear()} Bank Fee Index. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

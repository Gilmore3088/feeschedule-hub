import Link from "next/link";
import { getNationalIndex, getLandingPageStats } from "@/lib/crawler-db";
import { getDisplayName, TAXONOMY_COUNT } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";
import { RequestAccessForm } from "@/components/request-access-form";
import { PeerIndexExplorer } from "@/components/peer-index-explorer";

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

export default function LandingPage() {
  const allEntries = getNationalIndex();
  const stats = getLandingPageStats();
  const snapshotEntries = INDEX_CATEGORIES.map((cat) =>
    allEntries.find((e) => e.fee_category === cat)
  ).filter((e): e is NonNullable<typeof e> => Boolean(e));

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <HeroSection
        snapshotEntries={snapshotEntries}
        totalInstitutions={stats.total_institutions}
        institutionsWithFees={stats.institutions_with_fees}
      />
      <WhatIsSection />
      <NationalIndexSection snapshotEntries={snapshotEntries} totalCategories={TAXONOMY_COUNT} />
      <PeerIndexExplorer />
      <InstitutionalComparisonSection />
      <MethodologySection />
      <WhoUsesSection />
      <RequestAccessSection />
      <PublicFooter />
    </div>
  );
}

/* ========== Hero ========== */
function HeroSection({
  snapshotEntries,
  totalInstitutions,
  institutionsWithFees,
}: {
  snapshotEntries: NonNullable<ReturnType<typeof getNationalIndex>[number]>[];
  totalInstitutions: number;
  institutionsWithFees: number;
}) {
  return (
    <section className="relative overflow-hidden bg-[#0f172a] pt-14">
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
          <div>
            <h1 className="text-[2.75rem] md:text-[3.25rem] leading-[1.08] font-light tracking-tight text-white">
              The National
              <br />
              Benchmark for
              <br />
              <span className="font-normal">Retail Banking Fees.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">
              Compare your institution&apos;s pricing against national and
              peer-level fee indexes derived from thousands of U.S. financial
              institutions.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-[13px] text-slate-500">
              <span>
                <span className="font-semibold text-white tabular-nums">
                  {totalInstitutions.toLocaleString()}
                </span>{" "}
                institutions
              </span>
              <span>
                <span className="font-semibold text-white tabular-nums">
                  {institutionsWithFees.toLocaleString()}
                </span>{" "}
                fee schedules
              </span>
              <span>
                <span className="font-semibold text-white tabular-nums">
                  {TAXONOMY_COUNT}
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
              <Link
                href="/fees"
                className="inline-flex items-center rounded border border-slate-600 px-5 py-2.5 text-[13px] font-medium text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
              >
                View National Index
              </Link>
            </div>
          </div>

          {/* Index Preview Card */}
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
                    className={i < 3 ? "border-b border-slate-700/30" : ""}
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
                {TAXONOMY_COUNT} categories indexed
              </span>
              <Link
                href="/fees"
                className="text-[12px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
              >
                Explore Fee Index &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
    </section>
  );
}

/* ========== What Is ========== */
function WhatIsSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              What Is the Bank Fee Index?
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
              The Bank Fee Index aggregates publicly available fee schedules from
              U.S. banks and credit unions and calculates median benchmarks
              across {TAXONOMY_COUNT} standardized fee categories, including:
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
              Data includes extracted fees across multiple review stages. See our{" "}
              <Link href="/about" className="text-amber-600 hover:text-amber-700 underline">
                methodology
              </Link>{" "}
              for details.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f172a]">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 3v18" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-900">National Index</p>
                <p className="mt-1 text-xs text-slate-500">All Institutions</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Median Calculations</p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f172a]">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3v18M3 12h18" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-900">Peer Index</p>
                <p className="mt-1 text-xs text-slate-500">Filtered by Asset Size,</p>
                <p className="text-[11px] text-slate-400">Fed District, and Charter Type</p>
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
  );
}

/* ========== National Index Snapshot ========== */
function NationalIndexSection({
  snapshotEntries,
  totalCategories,
}: {
  snapshotEntries: NonNullable<ReturnType<typeof getNationalIndex>[number]>[];
  totalCategories: number;
}) {
  return (
    <section id="national-index" className="bg-slate-50 border-y border-slate-200 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            National Index Snapshot
          </h2>
          <p className="mt-3 text-[15px] text-slate-500 max-w-xl mx-auto">
            Median benchmarks across {totalCategories} standardized fee categories.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">National Median</th>
                <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">P25 &ndash; P75</th>
                <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Contributing Institutions</th>
              </tr>
            </thead>
            <tbody>
              {snapshotEntries.map((entry, i) => (
                <tr key={entry!.fee_category} className={i < snapshotEntries.length - 1 ? "border-b border-slate-100" : ""}>
                  <td className="px-6 py-3.5 font-medium text-slate-900">{getDisplayName(entry!.fee_category)}</td>
                  <td className="px-6 py-3.5 text-right font-semibold text-slate-900 tabular-nums">{formatAmount(entry!.median_amount)}</td>
                  <td className="hidden sm:table-cell px-6 py-3.5 text-right text-slate-500 tabular-nums text-xs">
                    {entry!.p25_amount !== null && entry!.p75_amount !== null
                      ? `${formatAmount(entry!.p25_amount)} - ${formatAmount(entry!.p75_amount)}`
                      : "-"}
                  </td>
                  <td className="hidden sm:table-cell px-6 py-3.5 text-right text-slate-600 tabular-nums">{entry!.institution_count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-400">{totalCategories} categories indexed</span>
            <Link href="/fees" className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
              View Full Index &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ========== Institutional Comparison ========== */
function InstitutionalComparisonSection() {
  return (
    <section className="bg-[#0f172a] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Institutional Comparison</h2>
          <p className="mt-3 text-[15px] text-slate-400 max-w-lg mx-auto">
            Understand whether your institution&apos;s pricing aligns with peer medians or diverges from national benchmarks.
          </p>
        </div>
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 overflow-hidden max-w-2xl mx-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-700/40 text-left">
                <th className="px-5 py-3 text-xs font-medium text-slate-500">Category</th>
                <th className="px-4 py-3 text-xs font-medium text-amber-400 text-right">Your Fee</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">Peer Median</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-500 text-right">National Median</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "NSF", yours: "$34.00", peer: "$31.00", national: "$32.50" },
                { name: "Overdraft", yours: "$28.00", peer: "$30.00", national: "$30.00" },
                { name: "Monthly Maintenance", yours: "$8.95", peer: "$7.00", national: "$6.82" },
              ].map((row, i, arr) => (
                <tr key={row.name} className={i < arr.length - 1 ? "border-b border-slate-700/30" : ""}>
                  <td className="px-5 py-3 text-slate-300">{row.name}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-400">{row.yours}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{row.peer}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">{row.national}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-center mt-8">
          <a href="#request-access" className="inline-flex items-center rounded bg-amber-400 px-5 py-2.5 text-[13px] font-semibold text-[#0f172a] hover:bg-amber-300 transition-colors">
            Request Comparative Analysis
          </a>
        </div>
      </div>
    </section>
  );
}

/* ========== Methodology ========== */
function MethodologySection() {
  return (
    <section id="methodology" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            Methodology &amp; Data Integrity
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
            The Bank Fee Index is built on publicly available data processed through a structured validation pipeline.{" "}
            <Link href="/about" className="text-amber-600 hover:text-amber-700 underline">
              Read the full methodology &rarr;
            </Link>
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "Public Sources", desc: "Fee schedules collected from publicly available institution websites and regulatory filings." },
            { title: "Structured Extraction", desc: `Automated extraction with human validation. Each fee is categorized into one of ${TAXONOMY_COUNT} standardized categories.` },
            { title: "Validation Workflow", desc: "Multi-stage review: pending, staged, approved. Maturity badges indicate data quality." },
            { title: "Median-Based Calculations", desc: "Medians are used as the primary metric to minimize the impact of outliers and skewed distributions." },
            { title: "Percentile Ranges", desc: "P25 and P75 ranges provide context for the spread of fees within each category." },
            { title: "Regular Updates", desc: "Fee schedules are re-crawled on a rolling basis. Index calculations reflect the latest available data." },
          ].map((item) => (
            <div key={item.title} className="rounded border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== Who Uses ========== */
function WhoUsesSection() {
  return (
    <section className="bg-slate-50 border-y border-slate-200 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl text-center mb-12">
          Who Uses the Bank Fee Index
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {[
            { type: "Community Banks", desc: "Evaluate pricing against similar asset-tier peers." },
            { type: "Regional Banks", desc: "Assess district-level competitive positioning." },
            { type: "Credit Unions", desc: "Benchmark fee structures across charter segments." },
            { type: "Consultants", desc: "Support pricing strategy engagements with data." },
          ].map((item) => (
            <div key={item.type} className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.type}</p>
                <p className="mt-1 text-[13px] text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== Request Access ========== */
function RequestAccessSection() {
  return (
    <section id="request-access" className="bg-[#0f172a] py-20 md:py-28">
      <div className="mx-auto max-w-xl px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Request Access to the Bank Fee Index
          </h2>
          <p className="mt-3 text-[15px] text-slate-400">
            All inquiries are reviewed. Access is limited to institutional users.
          </p>
        </div>
        <RequestAccessForm />
      </div>
    </section>
  );
}

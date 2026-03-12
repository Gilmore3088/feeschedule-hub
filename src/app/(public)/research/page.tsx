import type { Metadata } from "next";
import Link from "next/link";
import { getStatesWithFeeData, getDistrictMetrics } from "@/lib/crawler-db";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export const metadata: Metadata = {
  title: "Research - Bank & Credit Union Fee Analysis",
  description:
    "Geographic analysis of bank and credit union fees. State-level reports for all 50 states and Federal Reserve district analysis with economic context.",
};

export default function ResearchHubPage() {
  const statesData = getStatesWithFeeData();
  const districtMetrics = getDistrictMetrics();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Research
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        Fee Research & Analysis
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        Explore bank and credit union fee data by state, Federal Reserve
        district, and nationally. Each report includes median fees, charter
        type comparisons, and benchmarks.
      </p>

      {/* National Index */}
      <section className="mt-10">
        <Link
          href="/research/national-fee-index"
          className="group block rounded-lg border border-blue-200 bg-blue-50/30 px-5 py-4 transition-colors hover:bg-blue-50/60"
        >
          <h2 className="text-sm font-bold text-blue-900 group-hover:text-blue-700">
            National Fee Index
          </h2>
          <p className="mt-1 text-[13px] text-blue-700/70">
            The definitive benchmark of US bank and credit union fees across 49
            categories. Medians, percentiles, and maturity scores.
          </p>
        </Link>
      </section>

      {/* State Reports */}
      <section className="mt-10">
        <h2 className="text-sm font-bold text-slate-800">
          State Fee Reports
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Fee benchmarks for {statesData.length} states and territories with
          extracted fee data.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {statesData.map((s) => (
            <Link
              key={s.state_code}
              href={`/research/state/${s.state_code}`}
              className="group rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
            >
              <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                {STATE_NAMES[s.state_code] ?? s.state_code}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-400">
                {s.institution_count.toLocaleString()} institutions
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* District Reports */}
      <section className="mt-10">
        <h2 className="text-sm font-bold text-slate-800">
          Federal Reserve District Reports
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Fee analysis across all 12 Federal Reserve districts with economic
          context from the Beige Book.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {districtMetrics.map((d) => (
            <Link
              key={d.district}
              href={`/research/district/${d.district}`}
              className="group rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-slate-400">
                  {d.district}
                </span>
                <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                  {DISTRICT_NAMES[d.district]}
                </span>
              </div>
              <div className="mt-1 flex gap-4 text-[11px] text-slate-400">
                <span>{d.institution_count.toLocaleString()} institutions</span>
                <span>{d.total_fees.toLocaleString()} fees</span>
                <span>{Math.round(d.fee_url_pct)}% coverage</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Bank Fee Research Reports",
            description:
              "Geographic analysis of bank and credit union fees across all 50 US states and 12 Federal Reserve districts.",
            url: "https://bankfeeindex.com/research",
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

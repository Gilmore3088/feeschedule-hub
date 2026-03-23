export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { getDistrictMetrics, getPublicStats } from "@/lib/crawler-db";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Federal Reserve Districts - Fee Analysis by District",
  description:
    "Fee benchmarks and institutional coverage across all 12 Federal Reserve districts. Compare fee levels, coverage rates, and economic context by region.",
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

export default async function DistrictsPage() {
  const metrics = await getDistrictMetrics();
  const stats = await getPublicStats();

  const totalDistrictInstitutions = metrics.reduce(
    (a, m) => a + m.institution_count,
    0
  );
  const totalDistrictFees = metrics.reduce((a, m) => a + m.total_fees, 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Research", href: "/research" },
          { name: "Districts", href: "/districts" },
        ]}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[12px] text-[#A09788] mb-6">
        <Link href="/" className="hover:text-[#1A1815] transition-colors">Home</Link>
        <span className="text-[#D4C9BA]">/</span>
        <Link href="/research" className="hover:text-[#1A1815] transition-colors">Research</Link>
        <span className="text-[#D4C9BA]">/</span>
        <span className="text-[#5A5347]">Districts</span>
      </nav>

      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Geographic Analysis
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Federal Reserve Districts
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-[#7A7062]">
        Fee benchmarks across all 12 Federal Reserve districts.{" "}
        {totalDistrictInstitutions.toLocaleString()} institutions and{" "}
        {totalDistrictFees.toLocaleString()} fee observations with regional
        economic context from the Beige Book.
      </p>

      {/* District grid */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m) => {
          const name = DISTRICT_NAMES[m.district] ?? `District ${m.district}`;
          const accent = DISTRICT_ACCENTS[m.district] ?? "border-l-[#D4C9BA]";
          const coveragePct =
            m.institution_count > 0
              ? Math.round((m.with_fee_url / m.institution_count) * 100)
              : 0;

          return (
            <Link
              key={m.district}
              href={`/research/district/${m.district}`}
              className={`group rounded-xl border border-[#E8DFD1]/80 ${accent} border-l-[3px] px-5 py-4 transition-all hover:border-[#E8DFD1] hover:shadow-md hover:shadow-[#C44B2E]/5 no-underline`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-[#FAF7F2] text-[11px] font-bold text-[#7A7062] tabular-nums">
                  {m.district}
                </span>
                <h2
                  className="text-[15px] font-semibold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors"
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                  }}
                >
                  {name}
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-[#A09788]">Institutions</p>
                  <p className="text-[14px] font-semibold tabular-nums text-[#5A5347]">
                    {m.institution_count.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#A09788]">Fees</p>
                  <p className="text-[14px] font-semibold tabular-nums text-[#5A5347]">
                    {m.total_fees.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#A09788]">Coverage</p>
                  <p className="text-[14px] font-semibold tabular-nums text-[#5A5347]">
                    {coveragePct}%
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Methodology */}
      <section className="mt-12 rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-6 py-5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
          About This Data
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#7A7062]">
          Each Federal Reserve district covers multiple states. District-level
          benchmarks aggregate fee data from all tracked institutions within
          the district boundaries. Coverage percentage reflects the proportion
          of institutions with published fee schedule URLs.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Federal Reserve District Fee Analysis",
            description:
              "Fee benchmarks across all 12 Federal Reserve districts.",
            url: `${SITE_URL}/districts`,
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

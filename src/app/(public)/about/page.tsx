import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db";
import { TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

export const metadata: Metadata = {
  title: "About - Bank Fee Index",
  description:
    "Bank Fee Index is the definitive source for US bank and credit union fee data. Learn about our methodology, data sources, and mission.",
};

export default async function AboutPage() {
  const stats = await getPublicStats();
  const freshness = await getDataFreshness();
  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          About
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        About Bank Fee Index
      </h1>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#5A5347]">
        <p>
          Bank Fee Index is the definitive source for US bank and credit union
          fee intelligence. We track, benchmark, and analyze fee schedules
          from financial institutions across all 50 states and 12 Federal
          Reserve districts.
        </p>

        <p>
          Our platform serves two audiences: consumers who want to understand
          what their bank charges and how it compares, and financial
          professionals who need competitive intelligence, peer benchmarking,
          and regulatory context to make pricing decisions.
        </p>

        <h2
          className="text-[18px] font-medium text-[#1A1815] pt-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Our Data
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { value: stats.total_institutions.toLocaleString(), label: "Institutions" },
            { value: stats.total_observations.toLocaleString(), label: "Fee observations" },
            { value: String(TAXONOMY_COUNT), label: "Fee categories" },
            { value: String(stats.total_states), label: "States & territories" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 px-4 py-3 text-center"
            >
              <p className="text-[20px] font-bold tabular-nums text-[#1A1815]">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11px] text-[#A09788]">{stat.label}</p>
            </div>
          ))}
        </div>

        <h2
          className="text-[18px] font-medium text-[#1A1815] pt-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Methodology
        </h2>

        <p>
          We collect fee schedule data from publicly available sources including
          institution websites, regulatory filings, and official disclosures.
          Each fee is extracted, categorized into our {TAXONOMY_COUNT}-category
          taxonomy, and validated through automated quality checks and manual
          review.
        </p>

        <p>
          Our national benchmarks include medians, percentile ranges (P25-P75),
          and institutional coverage counts. Data maturity is classified as
          &ldquo;strong&rdquo; (10+ approved observations), &ldquo;provisional&rdquo;
          (10+ total observations), or &ldquo;insufficient&rdquo; to help users
          assess statistical confidence.
        </p>

        <h2
          className="text-[18px] font-medium text-[#1A1815] pt-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Data Sources
        </h2>

        <ul className="list-disc pl-6 space-y-1.5 text-[14px]">
          <li>Published fee schedules from bank and credit union websites</li>
          <li>FDIC Call Reports for bank financial data</li>
          <li>NCUA 5300 Reports for credit union financial data</li>
          <li>Federal Reserve Beige Book for district economic context</li>
          <li>FRED economic indicators for macro benchmarking</li>
        </ul>

        {lastUpdated && (
          <p className="text-[13px] text-[#A09788]">
            Data last updated {lastUpdated}.
          </p>
        )}

        <h2
          className="text-[18px] font-medium text-[#1A1815] pt-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Contact
        </h2>

        <p>
          For questions, partnership inquiries, or data licensing, reach us
          at{" "}
          <a
            href="mailto:hello@bankfeeindex.com"
            className="text-[#C44B2E] hover:underline"
          >
            hello@bankfeeindex.com
          </a>{" "}
          or use our{" "}
          <Link href="/contact" className="text-[#C44B2E] hover:underline">
            contact form
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

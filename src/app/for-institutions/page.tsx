import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Users,
  FileText,
  TrendingUp,
  BarChart2,
  Shield,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { getPublicStats } from "@/lib/crawler-db/core";
import { CustomerFooter } from "@/components/customer-footer";

export const metadata: Metadata = {
  title: "For Financial Institutions -- Bank Fee Index",
  description:
    "Fee intelligence, peer benchmarking, and AI-powered research for banking professionals. Replace your $15K pricing study.",
};

export default async function ForInstitutionsPage() {
  const stats = await getPublicStats();

  return (
    <div className="min-h-screen">
      {/* Hero -- dark, professional */}
      <section className="bg-[#1A1815] relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-14 lg:pt-20 lg:pb-16">
          <div className="max-w-2xl">
            <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#C44B2E]">
              Bank Fee Index Pro
            </span>
            <h1
              className="mt-4 text-[#F5EFE6] leading-[1.1] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(28px, 5vw, 44px)",
                fontWeight: 400,
              }}
            >
              Stop guessing what your
              competitors charge
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-[#A09788] max-w-lg">
              {stats.total_institutions.toLocaleString()}+ institutions.
              49 fee categories. Call Reports, FRED data, and Beige Book
              commentary -- cross-referenced by an AI analyst that answers
              in seconds, not weeks.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                href="/subscribe"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C44B2E] px-7 py-3.5 text-[15px] font-bold text-white hover:bg-[#A93D25] transition-colors"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pro"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#3D3830] px-7 py-3.5 text-[15px] font-normal text-[#F5EFE6] hover:border-[#7A7062] transition-colors"
              >
                See a Demo
              </Link>
            </div>
          </div>
        </div>

        {/* Subtle gradient */}
        <div className="absolute top-0 right-0 w-1/3 h-full pointer-events-none bg-gradient-to-l from-[#C44B2E]/[0.06] to-transparent" />
      </section>

      {/* Problem statement */}
      <section className="bg-[#F5EFE6]/60 border-b border-[#E8DFD1]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="max-w-3xl mx-auto text-center">
            <h2
              className="text-[#1A1815] text-[24px]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Your pricing team is spending weeks on what Hamilton does in 30 seconds
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#6B6355]">
              Fee schedules are buried across thousands of bank websites. Call Reports
              are in one place, FRED data in another, Beige Book in a third. Your
              analysts spend days collecting what we already have organized.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <Clock className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[14px] font-bold text-[#1A1815]">
                Days of research
              </p>
              <p className="mt-1 text-[13px] text-[#7A7062]">
                Collecting fee schedules from competitor websites one by one
              </p>
            </div>
            <div className="text-center">
              <BarChart2 className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[14px] font-bold text-[#1A1815]">
                Incomplete data
              </p>
              <p className="mt-1 text-[13px] text-[#7A7062]">
                Missing institutions, outdated numbers, no revenue correlation
              </p>
            </div>
            <div className="text-center">
              <FileText className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[14px] font-bold text-[#1A1815]">
                $15K consulting fees
              </p>
              <p className="mt-1 text-[13px] text-[#7A7062]">
                For a pricing study that's already stale by the time it's delivered
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Four capabilities */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
            What You Get
          </span>
          <h2
            className="mt-3 text-[#1A1815] text-[28px]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Four tools. One subscription.
          </h2>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[#E8DFD1] p-6">
              <Brain className="h-6 w-6 text-[#C44B2E]" />
              <h3 className="mt-4 text-[17px] font-bold text-[#1A1815]">
                Hamilton AI Analyst
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                &quot;What do community banks in District 7 charge for overdraft?&quot;
                Hamilton pulls from fee schedules, Call Reports, FRED indicators,
                and Beige Book commentary to answer in seconds. Like having a
                senior analyst on speed dial.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  50 queries per day
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Cross-references 5 federal data sources
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Every answer traceable to verified data
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#E8DFD1] p-6">
              <Users className="h-6 w-6 text-[#C44B2E]" />
              <h3 className="mt-4 text-[17px] font-bold text-[#1A1815]">
                Peer Benchmarking
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Build custom peer groups by charter type, asset size, and Fed
                district. See exactly where your fees land relative to
                institutions that actually compete with you -- not a national
                average that means nothing to a community bank in Kansas.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Save up to 10 peer groups
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Filter by 5 asset tiers and 12 districts
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Delta indicators vs. national median
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#E8DFD1] p-6">
              <FileText className="h-6 w-6 text-[#C44B2E]" />
              <h3 className="mt-4 text-[17px] font-bold text-[#1A1815]">
                On-Demand Reports
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Generate competitive briefs, district outlooks, and peer analyses
                that look like they came from McKinsey. PDF-ready, board-presentable,
                built from live data -- not a template someone filled in last quarter.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Peer briefs, competitive snapshots, district outlooks
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  3-5 pages, focused and actionable
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Download as PDF, share with your board
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#E8DFD1] p-6">
              <TrendingUp className="h-6 w-6 text-[#C44B2E]" />
              <h3 className="mt-4 text-[17px] font-bold text-[#1A1815]">
                Federal Data Hub
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Call Reports, FRED economic indicators, Beige Book commentary,
                and CFPB complaint data -- all in one place. Stop logging into
                four different government websites to piece together a picture.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  8 quarters of Call Report history
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  12 Fed district economic profiles
                </li>
                <li className="flex items-start gap-2 text-[13px] text-[#6B6355]">
                  <CheckCircle2 className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                  Revenue-to-fee correlation analysis
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Data proof */}
      <section className="bg-[#1A1815]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-[32px] font-bold text-[#F5EFE6] tabular-nums">
                {stats.total_institutions.toLocaleString()}+
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#7A7062]">
                Institutions
              </p>
            </div>
            <div className="text-center">
              <p className="text-[32px] font-bold text-[#F5EFE6] tabular-nums">
                49
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#7A7062]">
                Fee Categories
              </p>
            </div>
            <div className="text-center">
              <p className="text-[32px] font-bold text-[#F5EFE6] tabular-nums">
                12
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#7A7062]">
                Fed Districts
              </p>
            </div>
            <div className="text-center">
              <p className="text-[32px] font-bold text-[#F5EFE6] tabular-nums">
                5
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#7A7062]">
                Federal Data Sources
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-[#FAF7F2]">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2
            className="text-[#1A1815] text-[28px] text-center"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Built for the people who set the prices
          </h2>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <Shield className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[15px] font-bold text-[#1A1815]">
                Pricing Analysts
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Annual pricing studies in hours, not months. Real-time peer
                comparison instead of last year's survey data.
              </p>
            </div>
            <div className="text-center">
              <BarChart2 className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[15px] font-bold text-[#1A1815]">
                CFOs & Executives
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Board-ready reports that show where you stand. Revenue-to-fee
                correlation that connects pricing to income.
              </p>
            </div>
            <div className="text-center">
              <Users className="h-6 w-6 text-[#C44B2E] mx-auto" />
              <p className="mt-3 text-[15px] font-bold text-[#1A1815]">
                Consultants & Advisors
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
                Give every client engagement a data backbone. Generate custom
                peer analyses for each institution you serve.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#1A1815]">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <h2
            className="text-[#F5EFE6] text-[28px]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Ready to stop overpaying for fee intelligence?
          </h2>
          <p className="mt-3 text-[15px] text-[#A09788]">
            One subscription. Every tool your pricing team needs.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/subscribe"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C44B2E] px-8 py-3.5 text-[15px] font-bold text-white hover:bg-[#A93D25] transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#3D3830] px-8 py-3.5 text-[15px] font-normal text-[#F5EFE6] hover:border-[#7A7062] transition-colors"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      <CustomerFooter />
    </div>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  Search,
  BarChart2,
  BookOpen,
  Brain,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";

export function LandingTwoTrack() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Consumer Track */}
        <div>
          <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
            For Consumers
          </span>
          <h2
            className="mt-2 text-[#1A1815] text-[22px]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Know what you're paying -- and why
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Free tools to look up your bank, compare fees, and learn how to
            pay less.
          </p>

          <div className="mt-6 space-y-3">
            <Link
              href="/institutions"
              className="group flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4 hover:border-[#C44B2E]/30 hover:shadow-sm transition-all"
            >
              <Search className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#1A1815]">Fee Scout</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Type your bank's name and see exactly what they charge --
                  compared to everyone else.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#A09788] group-hover:text-[#C44B2E] mt-1 shrink-0 transition-colors" />
            </Link>

            <Link
              href="/fees"
              className="group flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4 hover:border-[#C44B2E]/30 hover:shadow-sm transition-all"
            >
              <BarChart2 className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#1A1815]">Fee Benchmarks</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Overdraft, ATM, wire transfer, monthly maintenance -- see
                  what's normal and what's not.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#A09788] group-hover:text-[#C44B2E] mt-1 shrink-0 transition-colors" />
            </Link>

            <Link
              href="/guides"
              className="group flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4 hover:border-[#C44B2E]/30 hover:shadow-sm transition-all"
            >
              <BookOpen className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#1A1815]">Fee Guides</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Your bank's fee schedule is 40 pages long. We turned it into
                  something you can actually read.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#A09788] group-hover:text-[#C44B2E] mt-1 shrink-0 transition-colors" />
            </Link>
          </div>
        </div>

        {/* Divider (desktop) */}
        <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-[#E8DFD1]" style={{ position: "relative", left: 0, width: 0 }} />

        {/* Professional Track */}
        <div>
          <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#C44B2E]">
            For Financial Institutions
          </span>
          <h2
            className="mt-2 text-[#1A1815] text-[22px]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Replace the $15K pricing study
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            AI-powered intelligence, peer benchmarking, and board-ready reports
            for banking professionals.
          </p>

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4">
              <Brain className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-bold text-[#1A1815]">Hamilton AI</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Ask any question about fees, revenue, or competitive
                  positioning. Answers in seconds, not weeks.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4">
              <Users className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-bold text-[#1A1815]">Peer Benchmarking</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Custom peer groups by charter, asset size, and district.
                  See exactly where you stand.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4">
              <FileText className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-bold text-[#1A1815]">On-Demand Reports</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Competitive briefs, district outlooks, and peer analyses.
                  Board-ready in minutes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#E8DFD1] bg-white p-4">
              <TrendingUp className="h-5 w-5 text-[#C44B2E] mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-bold text-[#1A1815]">Federal Data Hub</p>
                <p className="mt-1 text-[13px] text-[#6B6355]">
                  Call Reports, FRED, Beige Book, CFPB complaints -- all
                  cross-referenced in one place.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/for-institutions"
              className="inline-flex items-center gap-2 rounded-full bg-[#C44B2E] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#A93D25] transition-colors"
            >
              Learn More
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

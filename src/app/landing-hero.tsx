"use client";

import Link from "next/link";
import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";
import {
  BarChart2,
  BookOpen,
  Brain,
  FileText,
  Search,
  Users,
} from "lucide-react";

interface LandingHeroProps {
  totalInstitutions: number;
}

export function LandingHero({ totalInstitutions }: LandingHeroProps) {
  return (
    <section className="relative">
      {/* Two-tone background */}
      <div className="absolute inset-0 hidden lg:flex">
        <div className="w-1/2 bg-[#FAF7F2]" />
        <div className="w-1/2 bg-[#1A1815]" />
      </div>
      <div className="absolute inset-0 lg:hidden bg-[#FAF7F2]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2">

          {/* ═══ Consumer Side ═══ */}
          <div className="flex flex-col py-14 lg:py-16 lg:pr-12">
            {/* Row 1: Label */}
            <span className="text-[11px] font-normal uppercase tracking-[0.15em] text-[#A09788]">
              For Consumers
            </span>

            {/* Row 2: Headline */}
            <h1
              className="mt-4 text-[#1A1815] leading-[1.05] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(30px, 4.5vw, 42px)",
                fontWeight: 400,
              }}
            >
              What is your bank{" "}
              <em style={{ fontStyle: "italic", color: "#C44B2E" }}>really</em>{" "}
              charging you?
            </h1>

            {/* Row 3: Description */}
            <p className="mt-3 text-[15px] leading-relaxed text-[#6B6355]">
              Look up any bank or credit union and see exactly what they charge
              -- compared to {totalInstitutions.toLocaleString()}+ institutions nationwide.
            </p>

            {/* Row 4: Action (search bar) */}
            <div className="mt-6" aria-label="Search for a bank or credit union">
              <InstitutionSearchBar />
            </div>
            <p className="mt-2 text-[12px] text-[#A09788]">
              Free. No account required.
            </p>

            {/* Spacer pushes cards to bottom */}
            <div className="flex-1 min-h-6" />

            {/* Row 5: Cards (pinned to bottom) */}
            <div className="grid grid-cols-3 gap-3">
              <Link
                href="/institutions"
                className="group rounded-xl border border-[#E8DFD1] bg-white/80 px-3 py-3.5 hover:border-[#C44B2E]/40 hover:shadow-sm transition-all"
              >
                <Search className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                  Fee Scout
                </p>
                <p className="text-[11px] text-[#8A8176] mt-0.5">
                  Compare your bank&apos;s fees
                </p>
              </Link>
              <Link
                href="/fees"
                className="group rounded-xl border border-[#E8DFD1] bg-white/80 px-3 py-3.5 hover:border-[#C44B2E]/40 hover:shadow-sm transition-all"
              >
                <BarChart2 className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                  Benchmarks
                </p>
                <p className="text-[11px] text-[#8A8176] mt-0.5">
                  49 fee categories ranked
                </p>
              </Link>
              <Link
                href="/guides"
                className="group rounded-xl border border-[#E8DFD1] bg-white/80 px-3 py-3.5 hover:border-[#C44B2E]/40 hover:shadow-sm transition-all"
              >
                <BookOpen className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                  Fee Guides
                </p>
                <p className="text-[11px] text-[#8A8176] mt-0.5">
                  Plain-language explainers
                </p>
              </Link>
            </div>
          </div>

          {/* ═══ Institutional Side ═══
              Below lg: bleeds edge-to-edge via -mx-6 (parent has px-6) and adds
              its own px-6 back so content stays aligned. The 6-px top border
              makes the consumer→institutional transition deliberate rather than
              accidental on narrow viewports. */}
          <div className="flex flex-col py-14 lg:py-16 lg:pl-12 bg-[#1A1815] lg:bg-transparent -mx-6 px-6 lg:mx-0 lg:px-0 border-t-[6px] border-[#C44B2E] lg:border-t-0">
            {/* Row 1: Label */}
            <span className="text-[11px] font-normal uppercase tracking-[0.15em] text-[#C44B2E]">
              For Financial Industry Professionals
            </span>

            {/* Row 2: Headline */}
            <h2
              className="mt-4 text-[#F5EFE6] leading-[1.05] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(30px, 4.5vw, 42px)",
                fontWeight: 400,
              }}
            >
              Replace your $15K pricing study
            </h2>

            {/* Row 3: Description */}
            <p className="mt-3 text-[15px] leading-relaxed text-[#8A8176]">
              Peer benchmarking, AI-powered research, and board-ready reports
              -- built on {totalInstitutions.toLocaleString()}+ institutions
              and 5 federal data sources.
            </p>

            {/* Row 4: Action (search-as-onboarding) */}
            <div className="mt-6" aria-label="Search your institution to see its peer comparison">
              <InstitutionSearchBar
                variant="dark"
                placeholder="Type your institution name..."
              />
            </div>
            <p className="mt-2 text-[12px] text-[#8A8176]">
              See your peer comparison instantly.{" "}
              <Link
                href="/for-institutions"
                className="text-[#F5EFE6] hover:text-[#C44B2E] underline-offset-2 hover:underline transition-colors"
              >
                What you get with Pro
              </Link>{" "}
              ·{" "}
              <Link
                href="/subscribe"
                className="text-[#F5EFE6] hover:text-[#C44B2E] underline-offset-2 hover:underline transition-colors"
              >
                Plans from $199/mo
              </Link>
            </p>
            <p className="mt-1 text-[11px] text-[#5A5347] italic">
              About what a single McKinsey associate-day costs — for an entire seat-month.
            </p>

            {/* Spacer pushes cards to bottom */}
            <div className="flex-1 min-h-6" />

            {/* Row 5: Cards (pinned to bottom, aligned with consumer side) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[#3D3830] bg-[#2D2A26]/80 px-3 py-3.5">
                <Brain className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#F5EFE6]">Hamilton AI</p>
                <p className="text-[11px] text-[#7A7062] mt-0.5">
                  AI-powered fee analyst
                </p>
              </div>
              <div className="rounded-xl border border-[#3D3830] bg-[#2D2A26]/80 px-3 py-3.5">
                <Users className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#F5EFE6]">Peer Groups</p>
                <p className="text-[11px] text-[#7A7062] mt-0.5">
                  Custom peer benchmarks
                </p>
              </div>
              <div className="rounded-xl border border-[#3D3830] bg-[#2D2A26]/80 px-3 py-3.5">
                <FileText className="h-4 w-4 text-[#C44B2E] mb-2" />
                <p className="text-[13px] font-bold text-[#F5EFE6]">Reports & Data</p>
                <p className="text-[11px] text-[#7A7062] mt-0.5">
                  Board-ready, built for you
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

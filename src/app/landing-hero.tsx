"use client";

import Link from "next/link";
import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";
import {
  ArrowRight,
  Brain,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";

interface LandingHeroProps {
  totalInstitutions: number;
}

export function LandingHero({ totalInstitutions }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 pt-12 pb-10 lg:pt-16 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Consumer */}
          <div className="flex flex-col">
            <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
              For Consumers
            </span>
            <h1
              className="mt-3 text-[#1A1815] leading-[1.08] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(24px, 4vw, 34px)",
                fontWeight: 400,
              }}
            >
              What is your bank{" "}
              <em style={{ fontStyle: "italic" }}>really</em> charging you?
            </h1>

            <p className="mt-3 text-[15px] leading-relaxed text-[#6B6355]">
              Look up any bank or credit union and see exactly what they charge
              -- compared to {totalInstitutions.toLocaleString()}+ institutions
              nationwide.
            </p>

            <div
              className="mt-5"
              aria-label="Search for a bank or credit union"
            >
              <InstitutionSearchBar />
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-[#A09788]">
              <Link
                href="/fees"
                className="hover:text-[#C44B2E] transition-colors"
              >
                Browse all fees
              </Link>
              <Link
                href="/guides"
                className="hover:text-[#C44B2E] transition-colors"
              >
                Fee guides
              </Link>
              <Link
                href="/research"
                className="hover:text-[#C44B2E] transition-colors"
              >
                Research
              </Link>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block absolute left-1/2 top-12 bottom-10 w-px bg-[#E8DFD1]" />

          {/* Right: Institutions */}
          <div className="flex flex-col lg:pl-4">
            <span className="text-[12px] font-normal uppercase tracking-[0.1em] text-[#C44B2E]">
              For Financial Institutions
            </span>
            <h2
              className="mt-3 text-[#1A1815] leading-[1.12] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(22px, 3.5vw, 30px)",
                fontWeight: 400,
              }}
            >
              The fee intelligence platform that replaces your pricing study
            </h2>

            <p className="mt-3 text-[15px] leading-relaxed text-[#6B6355]">
              Peer benchmarking, AI-powered research, and board-ready reports
              -- built on {totalInstitutions.toLocaleString()}+ institutions
              and 5 federal data sources.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-2.5">
                <Brain className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-[#1A1815]">Hamilton AI</p>
                  <p className="text-[11px] text-[#7A7062]">On-demand analyst</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-2.5">
                <Users className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-[#1A1815]">Peer Groups</p>
                  <p className="text-[11px] text-[#7A7062]">Custom benchmarks</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-2.5">
                <FileText className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-[#1A1815]">Reports</p>
                  <p className="text-[11px] text-[#7A7062]">Board-ready PDFs</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-2.5">
                <TrendingUp className="h-4 w-4 text-[#C44B2E] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-[#1A1815]">Federal Data</p>
                  <p className="text-[11px] text-[#7A7062]">Call Reports & FRED</p>
                </div>
              </div>
            </div>

            <div className="mt-5">
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
      </div>
    </section>
  );
}

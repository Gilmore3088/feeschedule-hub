"use client";

import Link from "next/link";
import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";
import { BarChart2, Brain, FileText, Search, ShieldCheck, Users, type LucideIcon } from "lucide-react";

interface LandingHeroProps {
  totalInstitutions: number;
}

export function LandingHero({ totalInstitutions }: LandingHeroProps) {
  return (
    <section className="border-b border-[#E8DFD1] bg-[#FAF7F2]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] lg:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
              Fee Insight
            </p>
            <h1
              className="mt-3 max-w-3xl text-5xl font-normal leading-[0.98] text-[#1A1815] sm:text-6xl"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              The Bank Fee Index
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5A5347]">
              Find bank and credit union fees by district, state, size, and type --
              every figure traced to a published source document, with the financial
              context behind it.
            </p>

            <div className="mt-6 max-w-2xl" aria-label="Search for a bank or credit union">
              <InstitutionSearchBar />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7A7062]">
              <span>{totalInstitutions.toLocaleString()}+ institutions tracked</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#C44B2E] sm:inline-block" />
              <Link href="/institutions" className="font-semibold text-[#1A1815] hover:text-[#C44B2E]">
                Browse institution directory
              </Link>
              <span className="hidden h-1 w-1 rounded-full bg-[#C44B2E] sm:inline-block" />
              <Link href="/submit-fees" className="font-semibold text-[#1A1815] hover:text-[#C44B2E]">
                Submit a fee source
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-[#E8DFD1] bg-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
              Fee Insight Pro
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#1A1815]">
              Start with the institution, then run the full workflow.
            </h2>
            <div className="mt-5 divide-y divide-[#E8DFD1]">
              <WorkflowStep
                icon={Search}
                title="Find or claim"
                detail="Identify your institution, known sources, and data gaps."
              />
              <WorkflowStep
                icon={BarChart2}
                title="Benchmark"
                detail="Separate verified benchmarks from provisional direction."
              />
              <WorkflowStep
                icon={Brain}
                title="Analyze"
                detail="Ask Hamilton, our AI analyst, for peer, risk, and revenue implications."
              />
              <WorkflowStep
                icon={FileText}
                title="Report"
                detail="Generate board-ready competitive briefs."
              />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Link
                href="/for-institutions"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1A1815] px-3 py-2 text-sm font-semibold text-white hover:bg-[#2C2822]"
              >
                <Users className="h-4 w-4" />
                See Pro workflow
              </Link>
              <Link
                href="/subscribe"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm font-semibold text-[#1A1815] hover:border-[#C44B2E] hover:text-[#C44B2E]"
              >
                <ShieldCheck className="h-4 w-4" />
                Pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#C44B2E]" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#1A1815]">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#7A7062]">{detail}</p>
      </div>
    </div>
  );
}

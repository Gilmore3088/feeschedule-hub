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
  // Palette: warm-* (light context) and warm-ink-* (dark context) tokens are
  // defined in globals.css @theme. They produce real Tailwind utilities so
  // they work in any route, no .consumer-brand wrapper required. The terra
  // accent is the brand terracotta. Hover-opacity modifiers (terra/40, etc.)
  // also work since Tailwind v4 supports the / opacity syntax on theme colors.
  return (
    <section className="relative">
      {/* Two-tone hero background */}
      <div className="absolute inset-0 hidden lg:flex">
        <div className="w-1/2 bg-warm-100" />
        <div className="w-1/2 bg-warm-ink-900" />
      </div>
      <div className="absolute inset-0 lg:hidden bg-warm-100" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2">

          {/* ═══ Consumer Side (light context — slate-* via .consumer-brand wrapper) ═══ */}
          <div className="flex flex-col py-14 lg:py-16 lg:pr-12">
            {/* Row 1: Label */}
            <span className="text-[11px] font-normal uppercase tracking-[0.15em] text-slate-400">
              For Consumers
            </span>

            {/* Row 2: Headline */}
            <h1
              className="mt-4 text-slate-900 leading-[1.05] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(30px, 4.5vw, 42px)",
                fontWeight: 400,
              }}
            >
              What is your bank{" "}
              <em className="text-amber-400">really</em>{" "}
              charging you?
            </h1>

            {/* Row 3: Description */}
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Look up any bank or credit union and see exactly what they charge
              -- compared to {totalInstitutions.toLocaleString()}+ institutions nationwide.
            </p>

            {/* Row 4: Action (search bar) */}
            <div className="mt-6" aria-label="Search for a bank or credit union">
              <InstitutionSearchBar />
            </div>
            <p className="mt-2 text-[12px] text-slate-400">
              Free. No account required.
            </p>

            {/* Spacer pushes cards to bottom */}
            <div className="flex-1 min-h-6" />

            {/* Row 5: Cards (pinned to bottom).
                Hover border opacity (/40) and group-hover state colors stay
                raw because the .consumer-brand wrapper doesn't currently
                remap those modifier variants. */}
            <div className="grid grid-cols-3 gap-3">
              <Link
                href="/institutions"
                className="group rounded-xl border border-slate-200 bg-white/80 px-3 py-3.5 hover:border-terra/40 hover:shadow-sm transition-all"
              >
                <Search className="h-4 w-4 text-amber-400 mb-2" />
                <p className="text-[13px] font-bold text-slate-900 group-hover:text-terra transition-colors">
                  Fee Scout
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Compare your bank&apos;s fees
                </p>
              </Link>
              <Link
                href="/fees"
                className="group rounded-xl border border-slate-200 bg-white/80 px-3 py-3.5 hover:border-terra/40 hover:shadow-sm transition-all"
              >
                <BarChart2 className="h-4 w-4 text-amber-400 mb-2" />
                <p className="text-[13px] font-bold text-slate-900 group-hover:text-terra transition-colors">
                  Benchmarks
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  49 fee categories ranked
                </p>
              </Link>
              <Link
                href="/guides"
                className="group rounded-xl border border-slate-200 bg-white/80 px-3 py-3.5 hover:border-terra/40 hover:shadow-sm transition-all"
              >
                <BookOpen className="h-4 w-4 text-amber-400 mb-2" />
                <p className="text-[13px] font-bold text-slate-900 group-hover:text-terra transition-colors">
                  Fee Guides
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
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
          <div className="flex flex-col py-14 lg:py-16 lg:pl-12 bg-warm-ink-900 lg:bg-transparent -mx-6 px-6 lg:mx-0 lg:px-0 border-t-[6px] border-terra lg:border-t-0">
            {/* Row 1: Label */}
            <span className="text-[11px] font-normal uppercase tracking-[0.15em] text-terra">
              For Financial Industry Professionals
            </span>

            {/* Row 2: Headline */}
            <h2
              className="mt-4 text-warm-ink-50 leading-[1.05] tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
                fontSize: "clamp(30px, 4.5vw, 42px)",
                fontWeight: 400,
              }}
            >
              Replace your $15K pricing study
            </h2>

            {/* Row 3: Description */}
            <p className="mt-3 text-[15px] leading-relaxed text-warm-ink-300">
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
            <p className="mt-2 text-[12px] text-warm-ink-300">
              See your peer comparison instantly.{" "}
              <Link
                href="/for-institutions"
                className="text-warm-ink-50 hover:text-terra underline-offset-2 hover:underline transition-colors"
              >
                What you get with Pro
              </Link>{" "}
              ·{" "}
              <Link
                href="/subscribe"
                className="text-warm-ink-50 hover:text-terra underline-offset-2 hover:underline transition-colors"
              >
                Plans from $199/mo
              </Link>
            </p>
            <p className="mt-1 text-[11px] text-warm-700 italic">
              About what a single McKinsey associate-day costs — for an entire seat-month.
            </p>

            {/* Spacer pushes cards to bottom */}
            <div className="flex-1 min-h-6" />

            {/* Row 5: Capability cards (decorative — search bar above is the
                primary CTA). Hover state acknowledges the cursor without
                becoming competing nav. Subtle border-warm + bg-lift + icon
                micro-shift, ~180ms ease — fast enough not to feel sluggish,
                slow enough to register as polish. */}
            <div className="grid grid-cols-3 gap-3">
              <div className="group rounded-xl border border-warm-ink-700 bg-warm-ink-800/80 px-3 py-3.5 transition-all duration-[180ms] hover:border-terra/60 hover:bg-warm-ink-700">
                <Brain className="h-4 w-4 text-terra mb-2 transition-transform duration-[180ms] group-hover:translate-x-0.5" />
                <p className="text-[13px] font-bold text-warm-ink-50">Hamilton AI</p>
                <p className="text-[11px] text-warm-ink-500 mt-0.5 transition-colors duration-[180ms] group-hover:text-warm-500">
                  AI-powered fee analyst
                </p>
              </div>
              <div className="group rounded-xl border border-warm-ink-700 bg-warm-ink-800/80 px-3 py-3.5 transition-all duration-[180ms] hover:border-terra/60 hover:bg-warm-ink-700">
                <Users className="h-4 w-4 text-terra mb-2 transition-transform duration-[180ms] group-hover:translate-x-0.5" />
                <p className="text-[13px] font-bold text-warm-ink-50">Peer Groups</p>
                <p className="text-[11px] text-warm-ink-500 mt-0.5 transition-colors duration-[180ms] group-hover:text-warm-500">
                  Custom peer benchmarks
                </p>
              </div>
              <div className="group rounded-xl border border-warm-ink-700 bg-warm-ink-800/80 px-3 py-3.5 transition-all duration-[180ms] hover:border-terra/60 hover:bg-warm-ink-700">
                <FileText className="h-4 w-4 text-terra mb-2 transition-transform duration-[180ms] group-hover:translate-x-0.5" />
                <p className="text-[13px] font-bold text-warm-ink-50">Reports & Data</p>
                <p className="text-[11px] text-warm-ink-500 mt-0.5 transition-colors duration-[180ms] group-hover:text-warm-500">
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

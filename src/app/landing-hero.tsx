"use client";

import Link from "next/link";
import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";
import { TrackLink } from "@/components/track-link";
import { PRODUCT_NAME, REPORT_OFFER, SITE_NAME } from "@/lib/constants";
import { HAMILTON_CANONICAL } from "@/app/for-institutions/hamilton-copy";
import { ArrowRight, FileText, MessageSquare, Search, Users, type LucideIcon } from "lucide-react";

interface LandingHeroProps {
  institutionsLabel: string;
}

const REPORT_LANE_HREF = "/for-institutions#report";
const SAMPLE_REPORT_HREF = "/reports/sample-competitive-fee-position";
const LANE_LINK_CLASS =
  "font-semibold text-[#A93D25] underline decoration-[#A93D25]/40 underline-offset-2 hover:text-[#8E2A17]";

export function LandingHero({ institutionsLabel }: LandingHeroProps) {
  return (
    <section className="border-b border-[#E0D7C9] bg-[#FAF7F2]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] lg:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B6255]">
              Published fees · {institutionsLabel} institutions · every figure sourced
            </p>
            <h1
              className="mt-3 max-w-3xl text-5xl font-normal leading-[0.98] text-[#1A1815] sm:text-6xl"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              The {PRODUCT_NAME}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5A5347]">
              What does your bank charge? Look up overdraft, ATM, wire and monthly fees for{" "}
              {institutionsLabel} banks and credit unions — every figure traced to the published
              schedule.
            </p>

            <div className="mt-6 max-w-2xl" aria-label="Search for a bank or credit union">
              <InstitutionSearchBar />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#6B6255]">
              <span>{institutionsLabel} institutions with verified fees</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#C44B2E] sm:inline-block" />
              <Link href="/institutions" className="font-semibold text-[#1A1815] hover:text-[#C44B2E]">
                Browse institution directory
              </Link>
              <span className="hidden h-1 w-1 rounded-full bg-[#C44B2E] sm:inline-block" />
              <Link href="/submit-fees" className="font-semibold text-[#1A1815] hover:text-[#C44B2E]">
                Submit a fee source
              </Link>
            </div>
            <p className="mt-4 max-w-2xl text-sm text-[#5A5347]">
              Work at a bank or credit union?{" "}
              <Link href={REPORT_LANE_HREF} className={LANE_LINK_CLASS}>
                Get your {REPORT_OFFER.name} — {REPORT_OFFER.priceLabel}
              </Link>
              <span className="mx-2 text-[#6B6255]">·</span>
              <TrackLink
                event="see_sample_report"
                eventProps={{ placement: "home_report_lane" }}
                href={SAMPLE_REPORT_HREF}
                className={LANE_LINK_CLASS}
              >
                See the sample report
              </TrackLink>
            </p>
          </div>

          <ProWorkflowCard />
        </div>
      </div>
    </section>
  );
}

function ProWorkflowCard() {
  return (
    <div className="rounded-lg border border-[#E0D7C9] bg-[#FDFBF8] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B6255]">
        {SITE_NAME} Pro
      </p>
      <h2 className="mt-2 text-xl font-semibold leading-snug text-[#1A1815]">
        See where your fees stand against the banks you actually compete with — by district,
        size and type.
      </h2>
      <div className="mt-5 divide-y divide-[#E0D7C9]">
        <WorkflowStep icon={Search} title="Pick your institution" />
        <WorkflowStep icon={Users} title="Build your peer group" />
        <WorkflowStep icon={MessageSquare} title="Ask Hamilton — every answer cited to a source" />
        <WorkflowStep icon={FileText} title="Export a board-ready brief" />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#6B6255]">{HAMILTON_CANONICAL}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Link
          href="/subscribe"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#A93D25]"
        >
          See pricing
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/for-institutions#pro"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm font-semibold text-[#1A1815] hover:border-[#1A1815]"
        >
          How Hamilton works
        </Link>
      </div>
    </div>
  );
}

function WorkflowStep({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#C44B2E]" />
      <p className="text-sm font-semibold text-[#1A1815]">{title}</p>
    </div>
  );
}

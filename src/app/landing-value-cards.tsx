import Link from "next/link";
import { Search, BarChart2, BookOpen, ArrowRight } from "lucide-react";

export function LandingValueCards() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-10 lg:pb-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1 -- Find Your Fees */}
        <Link
          href="/institutions"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <Search className="h-4 w-4 text-[#C44B2E]" />
          <span className="mt-3 text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
            Find Your Fees
          </span>
          <h3 className="mt-2 text-[15px] font-bold text-[#1A1815]">
            Look Up Your Bank
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Type your bank's name and see exactly what they charge -- compared
            to what everyone else pays.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>

        {/* Card 2 -- Compare Banks */}
        <Link
          href="/fees"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <BarChart2 className="h-4 w-4 text-[#C44B2E]" />
          <span className="mt-3 text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
            Compare Banks
          </span>
          <h3 className="mt-2 text-[15px] font-bold text-[#1A1815]">
            Browse Fee Data
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Overdraft, ATM, wire transfer, monthly maintenance -- see what's
            normal and what's not across the country.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>

        {/* Card 3 -- Learn About Fees */}
        <Link
          href="/guides"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <BookOpen className="h-4 w-4 text-[#C44B2E]" />
          <span className="mt-3 text-[12px] font-normal uppercase tracking-[0.1em] text-[#A09788]">
            Learn About Fees
          </span>
          <h3 className="mt-2 text-[15px] font-bold text-[#1A1815]">
            Fee Guides
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Your bank's fee schedule is 40 pages long. We turned it into
            something you can actually read.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>
      </div>
    </section>
  );
}

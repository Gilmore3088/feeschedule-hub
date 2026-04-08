import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

export function LandingGuideTeasers() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-10 lg:pb-12">
      <h2
        className="text-[28px] font-normal text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Fee Guides
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
        Know what you're paying for -- and how to pay less.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Teaser 1 -- Overdraft Fee */}
        <Link
          href="/guides"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <BookOpen className="h-4 w-4 text-[#C44B2E] mb-3" />
          <h3 className="text-[15px] font-bold text-[#1A1815]">
            What Is an Overdraft Fee?
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Your bank charged you $35 for a $4 coffee. Here's why -- and how to
            make sure it doesn't happen again.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>

        {/* Teaser 2 -- ATM Fees */}
        <Link
          href="/guides"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <BookOpen className="h-4 w-4 text-[#C44B2E] mb-3" />
          <h3 className="text-[15px] font-bold text-[#1A1815]">
            How to Avoid ATM Fees
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            That $3 surcharge adds up to $150 a year. Some banks reimburse every
            penny -- here's who.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>

        {/* Teaser 3 -- Wire Transfer */}
        <Link
          href="/guides"
          className="group flex flex-col rounded-xl border border-[#E8DFD1] bg-white p-6 hover:border-[#C44B2E]/30 hover:shadow-md transition-all duration-300"
        >
          <BookOpen className="h-4 w-4 text-[#C44B2E] mb-3" />
          <h3 className="text-[15px] font-bold text-[#1A1815]">
            Understanding Wire Transfer Costs
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355]">
            Sending $500 shouldn't cost $30. We break down what banks charge
            and the cheaper ways to move money.
          </p>
          <div className="mt-auto pt-4 self-end">
            <ArrowRight className="h-3.5 w-3.5 text-[#A09788] group-hover:text-[#C44B2E] transition-colors" />
          </div>
        </Link>
      </div>
    </section>
  );
}

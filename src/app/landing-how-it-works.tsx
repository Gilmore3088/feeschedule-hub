import { Search, BarChart2, Zap } from "lucide-react";

export function LandingHowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-10 lg:py-12">
      <h2
        className="text-[28px] font-normal text-[#1A1815] text-center"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        How It Works
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-[#6B6355] text-center max-w-lg mx-auto">
        It takes 30 seconds. No account needed.
      </p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
        {/* Step 1 */}
        <div className="text-center">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E8DFD1] text-[14px] font-bold text-[#C44B2E]">
            1
          </span>
          <Search className="h-5 w-5 text-[#A09788] mx-auto mt-4" />
          <h3 className="mt-3 text-[14px] font-normal uppercase tracking-[0.05em] text-[#1A1815]">
            Search
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355] max-w-xs mx-auto">
            Type your bank's name. We've got fee data on thousands of banks
            and credit unions.
          </p>
        </div>

        {/* Step 2 */}
        <div className="text-center">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E8DFD1] text-[14px] font-bold text-[#C44B2E]">
            2
          </span>
          <BarChart2 className="h-5 w-5 text-[#A09788] mx-auto mt-4" />
          <h3 className="mt-3 text-[14px] font-normal uppercase tracking-[0.05em] text-[#1A1815]">
            Compare
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355] max-w-xs mx-auto">
            See how your fees stack up against what other people are paying at
            similar banks.
          </p>
        </div>

        {/* Step 3 */}
        <div className="text-center">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#E8DFD1] text-[14px] font-bold text-[#C44B2E]">
            3
          </span>
          <Zap className="h-5 w-5 text-[#A09788] mx-auto mt-4" />
          <h3 className="mt-3 text-[14px] font-normal uppercase tracking-[0.05em] text-[#1A1815]">
            Act
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6355] max-w-xs mx-auto">
            Paying too much? You'll know. Staying put? At least it's your
            choice now.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { InstitutionSearchBar } from "@/app/(public)/institutions/search-bar";

interface LandingHeroProps {
  totalInstitutions: number;
}

export function LandingHero({ totalInstitutions }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h1
            className="text-[#1A1815] leading-[1.08] tracking-[-0.02em]"
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 400,
            }}
          >
            What is your bank{" "}
            <em style={{ fontStyle: "italic" }}>really</em> charging you?
          </h1>

          <p className="mt-4 text-[14px] leading-relaxed text-[#6B6355]">
            Compare fees across {totalInstitutions.toLocaleString()}+ banks and
            credit unions. Free, no account required.
          </p>

          <div
            className="mt-8 mx-auto max-w-xl"
            aria-label="Search for a bank or credit union"
          >
            <InstitutionSearchBar />
          </div>
        </div>
      </div>

      {/* Subtle gradient accent */}
      <div className="absolute top-0 right-0 w-1/2 h-full pointer-events-none bg-gradient-to-l from-[#C44B2E]/[0.03] to-transparent" />
    </section>
  );
}

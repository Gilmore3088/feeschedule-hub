import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingB2BStrip() {
  return (
    <section className="border-t border-[#E8DFD1] bg-[#F5EFE6]/40">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2
            className="text-[20px] font-normal text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            For Financial Institutions
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6B6355]">
            Peer benchmarking, competitive intelligence, and AI-powered research
            for banking professionals.
          </p>
        </div>

        <Link
          href="/for-institutions"
          className="inline-flex items-center gap-2 rounded-full bg-[#C44B2E] px-6 py-3 text-[14px] font-normal text-white hover:bg-[#A93D25] transition-colors shrink-0"
        >
          Learn More
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

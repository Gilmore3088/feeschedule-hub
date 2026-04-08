import type { PublicStats } from "@/lib/crawler-db/core";
import {
  Database,
  FileText,
  TrendingUp,
  BookOpen,
  AlertTriangle,
} from "lucide-react";

interface LandingDataAuthorityProps {
  stats: PublicStats;
}

export function LandingDataAuthority({ stats }: LandingDataAuthorityProps) {
  return (
    <section className="border-t border-b border-[#E8DFD1] bg-[#F5EFE6]/50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-center">
          <h2
            className="text-[#1A1815] text-[22px]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            One platform. Five federal data sources.
          </h2>
          <p className="mt-2 text-[14px] text-[#6B6355]">
            Everything a consumer or bank executive needs to understand fees --
            collected, verified, and cross-referenced.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex flex-col items-center text-center rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-4">
            <Database className="h-5 w-5 text-[#C44B2E]" />
            <p className="mt-2 text-[20px] font-bold text-[#1A1815] tabular-nums">
              {stats.total_institutions.toLocaleString()}+
            </p>
            <p className="text-[11px] text-[#7A7062] uppercase tracking-wide">
              Fee Schedules
            </p>
          </div>

          <div className="flex flex-col items-center text-center rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-4">
            <FileText className="h-5 w-5 text-[#C44B2E]" />
            <p className="mt-2 text-[20px] font-bold text-[#1A1815]">
              FDIC & NCUA
            </p>
            <p className="text-[11px] text-[#7A7062] uppercase tracking-wide">
              Call Reports
            </p>
          </div>

          <div className="flex flex-col items-center text-center rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-4">
            <TrendingUp className="h-5 w-5 text-[#C44B2E]" />
            <p className="mt-2 text-[20px] font-bold text-[#1A1815]">
              FRED
            </p>
            <p className="text-[11px] text-[#7A7062] uppercase tracking-wide">
              Economic Data
            </p>
          </div>

          <div className="flex flex-col items-center text-center rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-4">
            <BookOpen className="h-5 w-5 text-[#C44B2E]" />
            <p className="mt-2 text-[20px] font-bold text-[#1A1815]">
              Beige Book
            </p>
            <p className="text-[11px] text-[#7A7062] uppercase tracking-wide">
              12 Districts
            </p>
          </div>

          <div className="flex flex-col items-center text-center rounded-lg border border-[#E8DFD1] bg-white/70 px-3 py-4 col-span-2 md:col-span-1">
            <AlertTriangle className="h-5 w-5 text-[#C44B2E]" />
            <p className="mt-2 text-[20px] font-bold text-[#1A1815]">
              CFPB
            </p>
            <p className="text-[11px] text-[#7A7062] uppercase tracking-wide">
              Complaints
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

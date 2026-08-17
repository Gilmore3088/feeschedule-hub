import Link from "next/link";
import type { DistrictMetric } from "@/lib/data-store";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

/**
 * District accents on the warm scale (taxonomy family palette): terracotta,
 * wine, ochre, plum, slate-brown, teal-grey, olive, sand, clay — no rainbow.
 */
const DISTRICT_ACCENTS: Record<number, string> = {
  1: "border-l-[#C44B2E]",
  2: "border-l-[#8C3A52]",
  3: "border-l-[#B8862B]",
  4: "border-l-[#6B4A6E]",
  5: "border-l-[#6E5B4E]",
  6: "border-l-[#5B7A78]",
  7: "border-l-[#7A7F3F]",
  8: "border-l-[#C4A46A]",
  9: "border-l-[#A0522D]",
  10: "border-l-[#A93D25]",
  11: "border-l-[#8E2A17]",
  12: "border-l-[#7A7062]",
};

export function DistrictReportsSection({ districtMetrics }: { districtMetrics: DistrictMetric[] }) {
  return (
    <section className="mt-10" id="districts">
      <h2
        className="text-sm font-bold text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Federal Reserve District Reports
      </h2>
      <p className="mt-1 text-[13px] text-[#6B6255]">
        Fee analysis across all 12 Federal Reserve districts with
        economic context from the Beige Book.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {districtMetrics.map((d) => {
          const accent = DISTRICT_ACCENTS[d.district] ?? "border-l-[#D4C9BA]";
          return (
            <Link
              key={d.district}
              href={`/research/district/${d.district}`}
              className={`group rounded-xl border border-[#E8DFD1]/80 ${accent} border-l-[3px] px-4 py-3.5 transition-all hover:border-[#E8DFD1] hover:shadow-md hover:shadow-[#C44B2E]/5`}
            >
              <div className="flex items-baseline gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8DFD1]/40 text-[10px] font-bold text-[#6B6255]">
                  {d.district}
                </span>
                <span className="text-sm font-semibold text-[#1A1815] group-hover:text-[#A93D25] transition-colors">
                  {DISTRICT_NAMES[d.district]}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-[#6B6255]">Institutions</p>
                  <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                    {d.institution_count.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#6B6255]">Fees</p>
                  <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                    {d.total_fees.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#6B6255]">Coverage</p>
                  <p className="text-[13px] font-semibold tabular-nums text-[#5A5347]">
                    {Math.round(d.fee_url_pct * 100)}%
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end">
                <span className="text-[11px] font-medium text-[#A93D25] opacity-0 group-hover:opacity-100 transition-opacity">
                  View report &rarr;
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

import { formatAmount } from "@/lib/format";

export interface FeeComparison {
  label: string;
  institutionAmount: number;
  nationalMedian: number;
}

interface FeeComparisonBarsProps {
  comparisons: FeeComparison[];
}

/**
 * FeeComparisonBars — Spec #3, D-06.
 *
 * Horizontal bar chart comparing institution fee amounts to national medians
 * for 3-5 key fee categories. Returns null when no data is available — no
 * "data unavailable" placeholder is shown.
 *
 * Bars are normalized: the longest value across all rows = 100%.
 */
export function FeeComparisonBars({ comparisons }: FeeComparisonBarsProps) {
  if (comparisons.length === 0) return null;

  // Normalize: find the max value across all institution + median values
  const maxValue = Math.max(
    ...comparisons.flatMap((c) => [c.institutionAmount, c.nationalMedian])
  );

  if (maxValue <= 0) return null;

  return (
    <div className="rounded-xl border border-[#E8DFD1] bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
        vs. National Median
      </p>

      <div className="mt-3 space-y-4">
        {comparisons.map((comp) => {
          const instPct = Math.round((comp.institutionAmount / maxValue) * 100);
          const medPct = Math.round((comp.nationalMedian / maxValue) * 100);
          const isAbove = comp.institutionAmount > comp.nationalMedian * 1.005;
          const isBelow = comp.institutionAmount < comp.nationalMedian * 0.995;
          const instBarColor = isBelow
            ? "#16a34a"
            : isAbove
              ? "#dc2626"
              : "#7A7062";

          return (
            <div key={comp.label}>
              <p className="mb-1.5 text-[12px] font-medium text-[#1A1815]">{comp.label}</p>

              {/* Institution bar */}
              <div className="mb-1 flex items-center gap-2">
                <span className="w-[68px] shrink-0 text-[10px] text-[#A09788]">This bank</span>
                <div className="flex-1 h-[8px] rounded-full bg-[#F0EDE8] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${instPct}%`, backgroundColor: instBarColor }}
                  />
                </div>
                <span className="w-[44px] shrink-0 text-right text-[11px] tabular-nums font-medium text-[#1A1815]">
                  {formatAmount(comp.institutionAmount)}
                </span>
              </div>

              {/* National median bar */}
              <div className="flex items-center gap-2">
                <span className="w-[68px] shrink-0 text-[10px] text-[#A09788]">Nat. median</span>
                <div className="flex-1 h-[8px] rounded-full bg-[#F0EDE8] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${medPct}%`, backgroundColor: "#C8BEB4" }}
                  />
                </div>
                <span className="w-[44px] shrink-0 text-right text-[11px] tabular-nums text-[#A09788]">
                  {formatAmount(comp.nationalMedian)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

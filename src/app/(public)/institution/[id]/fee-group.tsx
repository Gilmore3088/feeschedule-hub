"use client";

import { formatAmount } from "@/lib/format";
import type { IndexEntry } from "@/lib/crawler-db/fee-index";

interface FeeRow {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  displayName: string;
  indexEntry: IndexEntry | null;
}

interface FeeGroupProps {
  groupName: string;
  fees: FeeRow[];
  isPrimary: boolean;
  defaultOpen: boolean;
}

/**
 * Computes the left% position of the institution dot on the market distribution bar.
 * P25 sits at 10%, P75 sits at 90%, so the bar spans from ~10% to ~90%.
 * Returns a value 0-100 clamped.
 */
function computeBarPosition(
  amount: number,
  entry: IndexEntry
): { p25Left: number; rangeWidth: number; dotLeft: number } {
  const min = entry.min_amount ?? 0;
  const max = entry.max_amount ?? (entry.median_amount ?? 0) * 2;
  const p25 = entry.p25_amount ?? entry.median_amount ?? 0;
  const p75 = entry.p75_amount ?? entry.median_amount ?? 0;

  const span = Math.max(max - min, 0.01);

  const p25Left = Math.max(0, Math.min(90, ((p25 - min) / span) * 100));
  const p75Right = Math.max(p25Left + 2, Math.min(98, ((p75 - min) / span) * 100));
  const rangeWidth = p75Right - p25Left;
  const dotLeft = Math.max(0, Math.min(96, ((amount - min) / span) * 100));

  return { p25Left, rangeWidth, dotLeft };
}

export function FeeGroup({ groupName, fees, isPrimary, defaultOpen }: FeeGroupProps) {
  if (fees.length === 0) return null;

  const summaryClass = isPrimary
    ? "relative pl-8 border-l-4 border-[#8a4c27] mb-6 flex items-center justify-between cursor-pointer list-none"
    : "relative pl-8 mb-6 flex items-center justify-between cursor-pointer list-none";

  const labelClass = isPrimary
    ? "font-sans text-xs uppercase tracking-[0.2em] text-[#8a4c27]"
    : "font-sans text-xs uppercase tracking-[0.2em] text-[#53443c]";

  const chevronClass = isPrimary
    ? "material-symbols-outlined text-sm text-[#8a4c27]/40 transition-transform duration-300 expand-icon"
    : "material-symbols-outlined text-sm text-[#53443c]/40 transition-transform duration-300 expand-icon";

  return (
    <details className="group/section" open={defaultOpen || undefined}>
      <summary className={summaryClass}>
        <div className="flex items-center gap-3">
          <h3 className={labelClass}>{groupName}</h3>
          <span className={chevronClass}>expand_more</span>
        </div>
        <div className="hidden md:flex gap-12 text-[10px] uppercase tracking-widest text-[#53443c]/50 pr-4">
          <span className="w-32">Market Distribution</span>
          <span className="w-16 text-right">Amount</span>
          <span className="w-16 text-right">Freq.</span>
        </div>
      </summary>

      <div className="pl-8 pb-8 space-y-0.5">
        {fees.map((fee) => {
          const hasBar = fee.indexEntry !== null && fee.amount !== null && fee.amount >= 0;
          const barPos = hasBar
            ? computeBarPosition(fee.amount!, fee.indexEntry!)
            : null;

          return (
            <div
              key={fee.id}
              className="grid grid-cols-12 gap-4 py-4 items-center border-b border-[#d8c2b8]/10 hover:bg-[#f5f3ee]/50 transition-colors px-2 -mx-2 rounded"
            >
              <div className="col-span-12 md:col-span-5 font-sans text-sm font-semibold text-[#1b1c19]">
                {fee.displayName}
                {fee.conditions && (
                  <span className="block text-[11px] font-normal text-[#53443c]/60 truncate max-w-xs mt-0.5">
                    {fee.conditions}
                  </span>
                )}
              </div>

              <div className="col-span-6 md:col-span-3">
                {hasBar && barPos ? (
                  <div className="relative h-1 bg-[#d8c2b8]/20 w-full rounded-full overflow-visible flex items-center">
                    <div
                      className="absolute h-1 bg-[#d8c2b8]/40 rounded-full"
                      style={{ left: `${barPos.p25Left}%`, width: `${barPos.rangeWidth}%` }}
                    />
                    <div
                      className="absolute w-2 h-2 bg-[#8a4c27] rounded-full shadow-sm ring-4 ring-[#8a4c27]/20"
                      style={{ left: `${barPos.dotLeft}%` }}
                    />
                  </div>
                ) : (
                  <div className="h-1 bg-[#d8c2b8]/10 rounded-full" />
                )}
              </div>

              <div className="col-span-3 md:col-span-2 text-right font-serif text-lg text-[#1b1c19]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {fee.amount === null ? (
                  <span className="text-sm text-[#53443c]/50 italic">N/A</span>
                ) : fee.amount === 0 ? (
                  <span className="font-serif text-lg">$0.00</span>
                ) : (
                  formatAmount(fee.amount)
                )}
              </div>

              <div className="col-span-3 md:col-span-2 text-right text-xs text-[#53443c]">
                {fee.frequency ? (
                  fee.frequency
                ) : (
                  <span className="italic text-[#53443c]/50">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

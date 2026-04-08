interface FeeCountCardProps {
  institutionCount: number;
  charterType: "bank" | "credit_union" | string | null;
}

/**
 * FeeCountCard — Spec #4.
 *
 * Shows the institution's total fee count alongside typical ranges for
 * banks and credit unions. Hardcoded typical ranges per spec.
 */
export function FeeCountCard({ institutionCount, charterType }: FeeCountCardProps) {
  const isCreditUnion = charterType === "credit_union";

  return (
    <div className="rounded-xl border border-[#E8DFD1] bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
        Fee Count
      </p>

      {/* Large fee count */}
      <p className="mt-1 text-[36px] font-bold tabular-nums leading-none text-[#1A1815]">
        {institutionCount}
      </p>
      <p className="mt-0.5 text-[12px] text-[#7A7062]">fees on record</p>

      {/* Typical ranges */}
      <div className="mt-3 space-y-1 border-t border-[#E8DFD1]/60 pt-3">
        <div className="flex items-center justify-between">
          <span
            className={`text-[12px] ${isCreditUnion ? "font-medium text-[#1A1815]" : "text-[#A09788]"}`}
          >
            Typical credit union
          </span>
          <span
            className={`text-[12px] tabular-nums ${isCreditUnion ? "font-medium text-[#1A1815]" : "text-[#A09788]"}`}
          >
            25–35
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`text-[12px] ${!isCreditUnion && charterType === "bank" ? "font-medium text-[#1A1815]" : "text-[#A09788]"}`}
          >
            Typical bank
          </span>
          <span
            className={`text-[12px] tabular-nums ${!isCreditUnion && charterType === "bank" ? "font-medium text-[#1A1815]" : "text-[#A09788]"}`}
          >
            30–50
          </span>
        </div>
      </div>
    </div>
  );
}

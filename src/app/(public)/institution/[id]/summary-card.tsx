import type { RatingResult } from "@/lib/institution-rating";

interface FeeSummaryCardProps {
  rating: RatingResult;
}

const COLOR_MAP = {
  green: {
    border: "#16a34a",
    label: "text-[#16a34a]",
    bg: "bg-[#f0fdf4]",
    dot: "bg-[#16a34a]",
  },
  yellow: {
    border: "#d97706",
    label: "text-[#d97706]",
    bg: "bg-[#fffbeb]",
    dot: "bg-[#d97706]",
  },
  red: {
    border: "#dc2626",
    label: "text-[#dc2626]",
    bg: "bg-[#fef2f2]",
    dot: "bg-[#dc2626]",
  },
};

/**
 * FeeSummaryCard — Spec #1, D-05.
 *
 * The most prominent element on the institution page. Always renders —
 * the rating engine guarantees output even when fee data is sparse.
 * Color-coded left border signals the overall fee rating at a glance.
 */
export function FeeSummaryCard({ rating }: FeeSummaryCardProps) {
  const colors = COLOR_MAP[rating.color];

  return (
    <div
      className="rounded-xl border border-[#E8DFD1] bg-white shadow-sm overflow-hidden"
      style={{ borderLeftWidth: "4px", borderLeftColor: colors.border }}
    >
      <div className="px-5 pt-4 pb-5">
        {/* Rating label */}
        <p className={`text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788]`}>
          Fee Rating
        </p>
        <p className={`mt-1 text-[20px] font-bold leading-tight ${colors.label}`}>
          {rating.label}
        </p>

        {/* Bullets */}
        {rating.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {rating.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-[5px] shrink-0 h-1.5 w-1.5 rounded-full ${colors.dot}`}
                  aria-hidden="true"
                />
                <span className="text-[13px] leading-snug text-[#5A5347]">{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

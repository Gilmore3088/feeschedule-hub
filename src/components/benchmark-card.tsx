import Link from "next/link";
import type { IndexEntry, VolatileCategory } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";

interface BenchmarkCardProps {
  entry: IndexEntry;
  volatileEntry?: VolatileCategory;
  href: string;
}

export function BenchmarkCard({ entry, volatileEntry, href }: BenchmarkCardProps) {
  // Contextual annotation logic
  const isHighDispersion =
    volatileEntry?.iqr !== null &&
    volatileEntry?.iqr !== undefined &&
    entry.median_amount !== null &&
    entry.median_amount > 0 &&
    volatileEntry.iqr > entry.median_amount * 0.3;

  return (
    <Link
      href={href}
      className="group admin-card p-4 hover:shadow-md transition-all"
    >
      <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 truncate">
        {getDisplayName(entry.fee_category)}
      </p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {formatAmount(entry.median_amount)}
      </p>

      {/* Context annotation */}
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
            {entry.institution_count} institutions
          </span>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              entry.maturity_tier === "strong"
                ? "bg-emerald-400"
                : entry.maturity_tier === "provisional"
                  ? "bg-amber-400"
                  : "bg-gray-300 dark:bg-gray-600"
            }`}
            title={entry.maturity_tier}
            role="img"
            aria-label={`Maturity: ${entry.maturity_tier}`}
          />
        </div>

        {/* Contextual tags */}
        {entry.maturity_tier === "insufficient" && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Limited data
          </p>
        )}
        {entry.maturity_tier === "strong" && entry.institution_count >= 20 && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
            Reliable benchmark
          </p>
        )}
        {isHighDispersion && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Wide price spread
          </p>
        )}
      </div>
    </Link>
  );
}

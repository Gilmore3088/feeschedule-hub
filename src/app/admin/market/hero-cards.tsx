import { formatAmount } from "@/lib/format";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { MaturityBadge } from "@/app/admin/index/maturity-badge";
import type { MarketIndexEntry } from "@/lib/crawler-db";

const HERO_CATEGORIES = [
  "monthly_maintenance",
  "nsf",
  "overdraft",
  "atm_non_network",
] as const;

interface HeroBenchmarkCardsProps {
  entries: MarketIndexEntry[];
  hasFilters: boolean;
}

export function HeroBenchmarkCards({
  entries,
  hasFilters,
}: HeroBenchmarkCardsProps) {
  const entryMap = new Map(entries.map((e) => [e.fee_category, e]));

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {HERO_CATEGORIES.map((cat) => {
        const entry = entryMap.get(cat);
        if (!entry) return <EmptyCard key={cat} category={cat} />;

        const segMedian = entry.median_amount;
        const natMedian = entry.national_median;
        const delta = entry.delta_pct;

        return (
          <div
            key={cat}
            className="rounded-lg border bg-white p-4 space-y-1"
          >
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {getDisplayName(cat)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-gray-900">
                {segMedian !== null ? formatAmount(segMedian) : "–"}
              </span>
              {hasFilters && delta !== null && (
                <DeltaPill delta={delta} />
              )}
            </div>
            {hasFilters && natMedian !== null && (
              <div className="text-[11px] text-gray-400 tabular-nums">
                National: {formatAmount(natMedian)}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-gray-400 tabular-nums">
                {entry.institution_count.toLocaleString()} inst
              </span>
              <MaturityBadge
                tier={entry.maturity_tier}
                approved={entry.approved_count}
                total={entry.observation_count}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyCard({ category }: { category: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 opacity-50">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {getDisplayName(category)}
      </div>
      <div className="text-2xl font-bold tabular-nums text-gray-300 mt-1">
        –
      </div>
      <div className="text-[11px] text-gray-400 mt-1">No data</div>
    </div>
  );
}

export function DeltaPill({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isZero = Math.abs(delta) < 0.05;

  if (isZero) {
    return (
      <span className="text-xs font-medium text-gray-400 tabular-nums">
        0%
      </span>
    );
  }

  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        isPositive ? "text-red-500" : "text-emerald-600"
      }`}
    >
      {isPositive ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

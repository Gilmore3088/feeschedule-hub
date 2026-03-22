import { getIndexCacheStats } from "@/lib/crawler-db/pipeline-runs";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { timeAgo } from "@/lib/format";

export async function IndexCacheCard() {
  const cache = await getIndexCacheStats();

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Fee Index Cache
        </h2>
        <div className="flex items-center gap-2">
          {cache.computed_at ? (
            <span className="text-[10px] text-gray-400">
              Updated {timeAgo(cache.computed_at)}
            </span>
          ) : (
            <span className="text-[10px] text-amber-500">Not yet computed</span>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {cache.categories} categories
          </span>
        </div>
      </div>

      {cache.spotlight.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-gray-100 dark:divide-white/5">
          {cache.spotlight.map((entry) => (
            <div key={entry.fee_category} className="px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                {getDisplayName(entry.fee_category)}
              </p>
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
                {entry.median_amount !== null ? `$${entry.median_amount.toFixed(2)}` : "-"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {entry.institution_count.toLocaleString()} inst
                </span>
                <span className={`text-[9px] font-medium px-1 rounded ${
                  entry.maturity_tier === "strong"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : entry.maturity_tier === "provisional"
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                }`}>
                  {entry.maturity_tier}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                P25: ${entry.p25_amount?.toFixed(2) || "-"} / P75: ${entry.p75_amount?.toFixed(2) || "-"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-[11px] text-gray-400">
            Run <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">publish-index</code> to populate the cache.
          </p>
        </div>
      )}
    </div>
  );
}

import { getDiscoveryMethodStats } from "@/lib/crawler-db/pipeline-runs";

export function DiscoveryStats() {
  const stats = getDiscoveryMethodStats();

  if (stats.length === 0) return null;

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Discovery Method Quality
        </h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Which URL discovery methods produce crawlable fee schedules
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Method</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Found</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Crawled</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Pre-screen Fail</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">HTTP Error</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Success Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {stats.map((row) => (
              <tr key={row.discovery_method} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300 capitalize">
                  {row.discovery_method.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {row.discovered}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {row.crawl_success}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-400">
                  {row.prescreen_fail}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                  {row.http_error}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.success_rate >= 50 ? "bg-emerald-500" : row.success_rate >= 30 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${row.success_rate}%` }}
                      />
                    </div>
                    <span className={`tabular-nums font-medium ${
                      row.success_rate >= 50 ? "text-emerald-600 dark:text-emerald-400"
                        : row.success_rate >= 30 ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    }`}>
                      {row.success_rate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

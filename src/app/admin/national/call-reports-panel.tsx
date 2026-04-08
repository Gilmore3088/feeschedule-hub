import { getRevenueTrend, getTopRevenueInstitutions } from "@/lib/crawler-db/call-reports";
import { formatAmount } from "@/lib/format";
import { RevenueTrendChart } from "./revenue-trend-chart";

function formatLargeAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return formatAmount(value);
}

function CharterBadge({ charter }: { charter: string }) {
  const isBank = charter === "bank";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isBank
          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      }`}
    >
      {isBank ? "Bank" : "CU"}
    </span>
  );
}

export async function CallReportsPanel() {
  let trend;
  let topInstitutions;

  try {
    [trend, topInstitutions] = await Promise.all([
      getRevenueTrend(8),
      getTopRevenueInstitutions(10),
    ]);
  } catch {
    return (
      <div className="admin-card p-8 text-center text-gray-400 text-sm">
        Failed to load Call Report data. Check database connection.
      </div>
    );
  }

  const latest = trend.latest;
  const quarters = trend.quarters;

  const bankPct =
    latest && latest.total_service_charges > 0
      ? ((latest.bank_service_charges / latest.total_service_charges) * 100).toFixed(1)
      : null;
  const cuPct =
    latest && latest.total_service_charges > 0
      ? ((latest.cu_service_charges / latest.total_service_charges) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4">
      {/* Section 1: Revenue Trend */}
      <div className="admin-card p-5 space-y-4">
        <div>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Service Charge Revenue Trend
          </span>
        </div>

        {latest ? (
          <div className="flex flex-wrap items-start gap-6 pb-2">
            <div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatLargeAmount(latest.total_service_charges)}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-400">
                  {latest.quarter} &middot; {latest.total_institutions.toLocaleString()} institutions
                </span>
                {latest.yoy_change_pct !== null && (
                  <span
                    className={`text-[11px] font-semibold ${
                      latest.yoy_change_pct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {latest.yoy_change_pct >= 0 ? "+" : ""}
                    {latest.yoy_change_pct.toFixed(1)}% YoY
                  </span>
                )}
              </div>
            </div>

            {bankPct !== null && cuPct !== null && (
              <div className="flex gap-6 text-[12px]">
                <div>
                  <span className="text-gray-400">Banks:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                    {formatLargeAmount(latest.bank_service_charges)}
                  </span>{" "}
                  <span className="text-gray-400">({bankPct}%)</span>
                </div>
                <div>
                  <span className="text-gray-400">Credit Unions:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                    {formatLargeAmount(latest.cu_service_charges)}
                  </span>{" "}
                  <span className="text-gray-400">({cuPct}%)</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400">No revenue data available</div>
        )}

        <RevenueTrendChart data={quarters} />
      </div>

      {/* Section 2: Top Institutions */}
      <div className="admin-card p-5 space-y-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Top Institutions by Service Charge Income
        </span>

        {topInstitutions.length === 0 ? (
          <div className="text-sm text-gray-400">No Call Report data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-10">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Institution
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-16">
                    Charter
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    SC Income
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Total Assets
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {topInstitutions.map((inst, idx) => (
                  <tr
                    key={inst.cert_number}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100 font-medium">
                      {inst.institution_name ?? inst.cert_number}
                    </td>
                    <td className="px-3 py-2.5">
                      <CharterBadge charter={inst.charter_type} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-200">
                      {formatLargeAmount(inst.service_charge_income)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {inst.total_assets !== null
                        ? formatLargeAmount(inst.total_assets)
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

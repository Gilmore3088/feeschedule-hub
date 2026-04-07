import {
  getIndustryHealthMetrics,
  getDepositGrowthTrend,
  getLoanGrowthTrend,
  getHealthMetricsByCharter,
  type IndustryHealthMetrics,
  type RichIndicator,
} from "@/lib/crawler-db/health";
import { Sparkline } from "@/components/sparkline";
import { GrowthChart } from "./growth-chart";

function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") {
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">↑</span>;
  }
  if (trend === "falling") {
    return <span className="text-red-500 dark:text-red-400 text-xs font-bold">↓</span>;
  }
  return <span className="text-gray-400 text-xs font-bold">→</span>;
}

function HealthMetricCard({
  label,
  indicator,
  formatValue,
  sparklineColor = "#10b981",
}: {
  label: string;
  indicator: RichIndicator | null;
  formatValue: (v: number) => string;
  sparklineColor?: string;
}) {
  return (
    <div className="admin-card p-4 space-y-1">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
        {label}
      </span>
      {indicator ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatValue(indicator.current)}
            </span>
            <Sparkline
              data={[...indicator.history].reverse().map((h) => h.value)}
              width={64}
              height={24}
              color={sparklineColor}
              className="shrink-0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <TrendArrow trend={indicator.trend} />
            <span className="text-[11px] text-gray-400">As of {indicator.asOf}</span>
          </div>
        </>
      ) : (
        <span className="text-sm text-gray-400">N/A</span>
      )}
    </div>
  );
}

function CharterMetricRow({
  label,
  bankValue,
  cuValue,
  format,
  lowerIsBetter = false,
}: {
  label: string;
  bankValue: number | null;
  cuValue: number | null;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const bankBetter =
    bankValue !== null && cuValue !== null
      ? lowerIsBetter
        ? bankValue < cuValue
        : bankValue > cuValue
      : null;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <td className="py-2 text-[12px] text-gray-500 dark:text-gray-400 pr-4">{label}</td>
      <td
        className={`py-2 text-right tabular-nums text-[13px] font-semibold pr-4 ${
          bankBetter === true
            ? "text-emerald-600 dark:text-emerald-400"
            : bankBetter === false
              ? "text-red-500 dark:text-red-400"
              : "text-gray-800 dark:text-gray-200"
        }`}
      >
        {bankValue !== null ? format(bankValue) : "N/A"}
      </td>
      <td
        className={`py-2 text-right tabular-nums text-[13px] font-semibold ${
          bankBetter === false
            ? "text-emerald-600 dark:text-emerald-400"
            : bankBetter === true
              ? "text-red-500 dark:text-red-400"
              : "text-gray-800 dark:text-gray-200"
        }`}
      >
        {cuValue !== null ? format(cuValue) : "N/A"}
      </td>
    </tr>
  );
}

function chartMetricValue(metrics: IndustryHealthMetrics, key: "roa" | "roe" | "efficiency_ratio"): number | null {
  return metrics[key]?.current ?? null;
}

export async function HealthPanel() {
  const [healthMetrics, depositTrend, loanTrend, chartMetrics] = await Promise.all([
    getIndustryHealthMetrics().catch(() => ({ roa: null, roe: null, efficiency_ratio: null })),
    getDepositGrowthTrend(8).catch(() => null),
    getLoanGrowthTrend(8).catch(() => null),
    getHealthMetricsByCharter().catch(() => ({
      bank: { roa: null, roe: null, efficiency_ratio: null },
      credit_union: { roa: null, roe: null, efficiency_ratio: null },
    })),
  ]);

  const formatRoa = (v: number) => `${(v * 100).toFixed(2)}%`;
  const formatRoe = (v: number) => `${(v * 100).toFixed(2)}%`;
  const formatEff = (v: number) => `${v.toFixed(1)}%`;

  return (
    <div className="space-y-4">
      {/* Section 1: Key Health Metrics */}
      <div className="admin-card p-5 space-y-4">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
          Industry Health Metrics
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthMetricCard
            label="Return on Assets (ROA)"
            indicator={healthMetrics.roa}
            formatValue={formatRoa}
            sparklineColor="#10b981"
          />
          <HealthMetricCard
            label="Return on Equity (ROE)"
            indicator={healthMetrics.roe}
            formatValue={formatRoe}
            sparklineColor="#6366f1"
          />
          <HealthMetricCard
            label="Efficiency Ratio"
            indicator={healthMetrics.efficiency_ratio}
            formatValue={formatEff}
            sparklineColor="#f59e0b"
          />
        </div>
      </div>

      {/* Section 2: Charter Comparison */}
      <div className="admin-card p-5 space-y-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
          Charter Comparison
        </span>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                <th className="py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pr-4">
                  Metric
                </th>
                <th className="py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider pr-4">
                  Banks
                </th>
                <th className="py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Credit Unions
                </th>
              </tr>
            </thead>
            <tbody>
              <CharterMetricRow
                label="Return on Assets (ROA)"
                bankValue={chartMetricValue(chartMetrics.bank, "roa")}
                cuValue={chartMetricValue(chartMetrics.credit_union, "roa")}
                format={formatRoa}
                lowerIsBetter={false}
              />
              <CharterMetricRow
                label="Return on Equity (ROE)"
                bankValue={chartMetricValue(chartMetrics.bank, "roe")}
                cuValue={chartMetricValue(chartMetrics.credit_union, "roe")}
                format={formatRoe}
                lowerIsBetter={false}
              />
              <CharterMetricRow
                label="Efficiency Ratio"
                bankValue={chartMetricValue(chartMetrics.bank, "efficiency_ratio")}
                cuValue={chartMetricValue(chartMetrics.credit_union, "efficiency_ratio")}
                format={formatEff}
                lowerIsBetter={true}
              />
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400">
          Emerald = better performer. Efficiency ratio: lower is better.
        </p>
      </div>

      {/* Section 3: Growth Trends */}
      <div className="admin-card p-5 space-y-4">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
          Deposit &amp; Loan Growth
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Deposits
              </span>
              {depositTrend?.current_yoy_pct !== null && depositTrend?.current_yoy_pct !== undefined && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    depositTrend.current_yoy_pct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {depositTrend.current_yoy_pct >= 0 ? "+" : ""}
                  {depositTrend.current_yoy_pct.toFixed(1)}% YoY
                </span>
              )}
            </div>
            {depositTrend ? (
              <GrowthChart data={depositTrend.history} label="Deposits" color="#10b981" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-[13px] text-gray-400">
                Growth data not available
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Loans
              </span>
              {loanTrend?.current_yoy_pct !== null && loanTrend?.current_yoy_pct !== undefined && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    loanTrend.current_yoy_pct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {loanTrend.current_yoy_pct >= 0 ? "+" : ""}
                  {loanTrend.current_yoy_pct.toFixed(1)}% YoY
                </span>
              )}
            </div>
            {loanTrend ? (
              <GrowthChart data={loanTrend.history} label="Loans" color="#3b82f6" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-[13px] text-gray-400">
                Growth data not available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { getRevenueTrend } from "@/lib/crawler-db/call-reports";
import { getNationalEconomicSummary, type RichIndicator } from "@/lib/crawler-db/fed";
import { getIndustryHealthMetrics } from "@/lib/crawler-db/health";
import { getBeigeBookHeadlines } from "@/lib/crawler-db/fed";
import { formatAmount } from "@/lib/format";
import { Sparkline } from "@/components/sparkline";

function FreshnessBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) {
    return (
      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
        No data
      </span>
    );
  }

  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);

  let cls: string;
  let label: string;

  if (days < 7) {
    cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    label = `${days}d ago`;
  } else if (days < 30) {
    cls = "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    label = `${days}d ago`;
  } else {
    cls = "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    label = `${days}d — stale`;
  }

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") {
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">↑</span>;
  }
  if (trend === "falling") {
    return <span className="text-red-500 dark:text-red-400 text-xs font-bold">↓</span>;
  }
  return <span className="text-gray-400 text-xs font-bold">→</span>;
}

function quarterToDate(quarter: string): string | null {
  // Quarter format: "2024-Q1" → "2024-03-31"
  const match = quarter.match(/^(\d{4})-Q(\d)$/);
  if (!match) return null;
  const year = match[1];
  const q = parseInt(match[2], 10);
  const monthEnd = [null, "03-31", "06-30", "09-30", "12-31"][q];
  if (!monthEnd) return null;
  return `${year}-${monthEnd}`;
}

function mostRecentAsOf(indicators: (RichIndicator | null)[]): string | null {
  const dates = indicators
    .filter((ind): ind is RichIndicator => ind !== null)
    .map((ind) => ind.asOf);
  if (dates.length === 0) return null;
  return dates.sort().reverse()[0];
}

export async function OverviewPanel() {
  const [revenueTrend, econSummary, healthMetrics, beigeBookMap] = await Promise.all([
    getRevenueTrend(2).catch(() => null),
    getNationalEconomicSummary().catch(() => ({ fed_funds_rate: null, unemployment_rate: null, cpi_yoy_pct: null, consumer_sentiment: null })),
    getIndustryHealthMetrics().catch(() => ({ roa: null, roe: null, efficiency_ratio: null })),
    getBeigeBookHeadlines().catch(() => new Map()),
  ]);

  const latestRevenue = revenueTrend?.latest ?? null;
  const revenueFreshnessDate = latestRevenue?.quarter
    ? quarterToDate(latestRevenue.quarter)
    : null;

  const econFreshnessDate = mostRecentAsOf([
    econSummary.fed_funds_rate,
    econSummary.unemployment_rate,
    econSummary.cpi_yoy_pct,
    econSummary.consumer_sentiment,
  ]);

  const beigeBookCount = beigeBookMap.size;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Card 1: Call Report Revenue */}
      <div className="admin-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Call Report Revenue
          </span>
          <FreshnessBadge dateStr={revenueFreshnessDate} />
        </div>

        {latestRevenue ? (
          <>
            <div>
              <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatAmount(latestRevenue.total_service_charges)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {latestRevenue.quarter} &middot;{" "}
                {latestRevenue.total_institutions.toLocaleString()} institutions
                {latestRevenue.yoy_change_pct !== null && (
                  <span className={`ml-2 font-semibold ${latestRevenue.yoy_change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {latestRevenue.yoy_change_pct >= 0 ? "+" : ""}
                    {latestRevenue.yoy_change_pct.toFixed(1)}% YoY
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-4 pt-1">
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                  Banks
                </div>
                <div className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                  {formatAmount(latestRevenue.bank_service_charges)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                  Credit Unions
                </div>
                <div className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                  {formatAmount(latestRevenue.cu_service_charges)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-400">No data available</div>
        )}
      </div>

      {/* Card 2: FRED Economic Data */}
      <div className="admin-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Economic Indicators
          </span>
          <FreshnessBadge dateStr={econFreshnessDate} />
        </div>

        <div className="space-y-2">
          {([
            { label: "Fed Funds Rate", indicator: econSummary.fed_funds_rate, format: (v: number) => `${v.toFixed(2)}%` },
            { label: "Unemployment", indicator: econSummary.unemployment_rate, format: (v: number) => `${v.toFixed(1)}%` },
            { label: "CPI YoY", indicator: econSummary.cpi_yoy_pct, format: (v: number) => `${v.toFixed(1)}%` },
            { label: "Consumer Sentiment", indicator: econSummary.consumer_sentiment, format: (v: number) => v.toFixed(1) },
          ] as { label: string; indicator: RichIndicator | null; format: (v: number) => string }[]).map(({ label, indicator, format }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 w-36 shrink-0">
                {label}
              </span>
              {indicator ? (
                <>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {format(indicator.current)}
                  </span>
                  <Sparkline
                    data={[...indicator.history].reverse().map((h) => h.value)}
                    width={64}
                    height={20}
                    color="#6366f1"
                    className="shrink-0"
                  />
                </>
              ) : (
                <span className="text-[11px] text-gray-400">No data</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Card 3: Beige Book */}
      <div className="admin-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Beige Book Intelligence
          </span>
          <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            Updated quarterly
          </span>
        </div>

        {beigeBookCount > 0 ? (
          <div>
            <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {beigeBookCount}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              district {beigeBookCount === 1 ? "summary" : "summaries"} available
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">No summaries generated</div>
        )}

        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Federal Reserve economic narratives from all 12 districts, updated 8x per year.
        </p>
      </div>

      {/* Card 4: Industry Health */}
      <div className="admin-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Industry Health
          </span>
          <FreshnessBadge dateStr={healthMetrics.roa?.asOf ?? null} />
        </div>

        {healthMetrics.roa || healthMetrics.roe || healthMetrics.efficiency_ratio ? (
          <div className="space-y-2">
            {healthMetrics.roa && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 w-32 shrink-0">
                  Return on Assets
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {(healthMetrics.roa.current * 100).toFixed(2)}%
                </span>
                <TrendArrow trend={healthMetrics.roa.trend} />
                <Sparkline
                  data={[...healthMetrics.roa.history].reverse().map((h) => h.value)}
                  width={64}
                  height={20}
                  color="#10b981"
                  className="shrink-0"
                />
              </div>
            )}
            {healthMetrics.roe && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 w-32 shrink-0">
                  Return on Equity
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {(healthMetrics.roe.current * 100).toFixed(2)}%
                </span>
                <TrendArrow trend={healthMetrics.roe.trend} />
                <Sparkline
                  data={[...healthMetrics.roe.history].reverse().map((h) => h.value)}
                  width={64}
                  height={20}
                  color="#6366f1"
                  className="shrink-0"
                />
              </div>
            )}
            {healthMetrics.efficiency_ratio && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 w-32 shrink-0">
                  Efficiency Ratio
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {healthMetrics.efficiency_ratio.current.toFixed(1)}%
                </span>
                <TrendArrow trend={healthMetrics.efficiency_ratio.trend} />
                <Sparkline
                  data={[...healthMetrics.efficiency_ratio.history].reverse().map((h) => h.value)}
                  width={64}
                  height={20}
                  color="#f59e0b"
                  className="shrink-0"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400">No data available</div>
        )}
      </div>

    </div>
  );
}

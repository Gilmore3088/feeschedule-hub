import {
  getNationalEconomicSummary,
  getDistrictBeigeBookSummaries,
  getBeigeBookHeadlines,
  type RichIndicator,
} from "@/lib/crawler-db/fed";
import { Sparkline } from "@/components/sparkline";

function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") {
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">↑</span>;
  }
  if (trend === "falling") {
    return <span className="text-red-500 dark:text-red-400 text-xs font-bold">↓</span>;
  }
  return <span className="text-gray-400 text-xs font-bold">→</span>;
}

function IndicatorCard({
  label,
  indicator,
  format,
  sparklineColor = "#6366f1",
}: {
  label: string;
  indicator: RichIndicator | null;
  format: (v: number) => string;
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
              {format(indicator.current)}
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

export async function EconomicPanel() {
  const [econSummary, districtSummaries, headlinesMap] = await Promise.all([
    getNationalEconomicSummary().catch(() => ({
      fed_funds_rate: null,
      unemployment_rate: null,
      cpi_yoy_pct: null,
      consumer_sentiment: null,
    })),
    getDistrictBeigeBookSummaries().catch(() => []),
    getBeigeBookHeadlines().catch(() => new Map()),
  ]);

  return (
    <div className="space-y-4">
      {/* Section 1: FRED Indicators */}
      <div className="admin-card p-5 space-y-4">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
          Economic Indicators (FRED)
        </span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <IndicatorCard
            label="Fed Funds Rate"
            indicator={econSummary.fed_funds_rate}
            format={(v) => `${v.toFixed(2)}%`}
            sparklineColor="#3b82f6"
          />
          <IndicatorCard
            label="Unemployment Rate"
            indicator={econSummary.unemployment_rate}
            format={(v) => `${v.toFixed(1)}%`}
            sparklineColor="#f59e0b"
          />
          <IndicatorCard
            label="CPI Year-over-Year"
            indicator={econSummary.cpi_yoy_pct}
            format={(v) => `${v.toFixed(1)}%`}
            sparklineColor="#ef4444"
          />
          <IndicatorCard
            label="Consumer Sentiment"
            indicator={econSummary.consumer_sentiment}
            format={(v) => v.toFixed(1)}
            sparklineColor="#10b981"
          />
        </div>
      </div>

      {/* Section 2: Beige Book District Summaries */}
      <div className="admin-card p-5 space-y-4">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
          Federal Reserve Beige Book &mdash; District Summaries
        </span>

        {districtSummaries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {districtSummaries.map((district) => (
              <div key={district.district_number} className="admin-card p-3 space-y-1.5">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  District {district.district_number} &mdash; {district.district_name}
                </div>
                <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  {district.summary}
                </p>
                {district.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {district.themes.map((theme) => (
                      <span
                        key={theme}
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-gray-400">{district.release_date}</div>
              </div>
            ))}
          </div>
        ) : headlinesMap.size > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-400 italic">
              Full district summaries not yet generated &mdash; showing headlines
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from(headlinesMap.entries()).map(([districtNum, headline]) => (
                <div key={districtNum} className="admin-card p-3 space-y-1">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    District {districtNum}
                  </div>
                  <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">
                    {headline.text}
                  </p>
                  <div className="text-[10px] text-gray-400">{headline.release_date}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">
            No Beige Book data available &mdash; run the summarization job
          </div>
        )}
      </div>
    </div>
  );
}

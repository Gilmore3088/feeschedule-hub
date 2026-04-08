import {
  getNationalEconomicSummary,
  getDistrictBeigeBookSummaries,
  getBeigeBookHeadlines,
  type RichIndicator,
} from "@/lib/crawler-db/fed";
import {
  getDistrictComplaintSummary,
  getNationalComplaintSummary,
  type DistrictComplaintSummary,
} from "@/lib/crawler-db/complaints";
import { Sparkline } from "@/components/sparkline";

const DISTRICT_NAMES: Record<number, string> = {
  1: "Boston",
  2: "New York",
  3: "Philadelphia",
  4: "Cleveland",
  5: "Richmond",
  6: "Atlanta",
  7: "Chicago",
  8: "St. Louis",
  9: "Minneapolis",
  10: "Kansas City",
  11: "Dallas",
  12: "San Francisco",
};

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
  const [econSummary, districtSummaries, headlinesMap, nationalComplaintsSummary, districtComplaints] = await Promise.all([
    getNationalEconomicSummary().catch(() => ({
      fed_funds_rate: null,
      unemployment_rate: null,
      cpi_yoy_pct: null,
      consumer_sentiment: null,
    })),
    getDistrictBeigeBookSummaries().catch(() => []),
    getBeigeBookHeadlines().catch(() => new Map()),
    getNationalComplaintSummary().catch(() => null),
    Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        getDistrictComplaintSummary(i + 1).catch(() => null)
      )
    ),
  ]);

  const avgComplaintsPerInst =
    nationalComplaintsSummary?.average_per_institution ?? 0;

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

      {/* Section 2: CFPB Complaints */}
      {nationalComplaintsSummary && (
        <div className="admin-card p-5 space-y-4">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
            CFPB Complaints
          </span>

          {/* National summary card */}
          <div className="admin-card p-4 space-y-2 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                National Total
              </span>
            </div>
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {nationalComplaintsSummary.total_complaints.toLocaleString()}
            </div>
            <div className="flex gap-6 text-[12px]">
              <div>
                <span className="text-gray-400">Fee-related: </span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {nationalComplaintsSummary.fee_related_pct.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-gray-400">Per institution: </span>
                <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                  {nationalComplaintsSummary.average_per_institution.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* 12-district grid */}
          {districtComplaints.some((d) => d !== null) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {districtComplaints.map((district, idx) => {
                if (!district) return null;
                const districtNum = idx + 1;
                const districtName = DISTRICT_NAMES[districtNum] || `District ${districtNum}`;
                const isAboveAvg = district.institution_count > 0
                  ? (district.total_complaints / district.institution_count) > avgComplaintsPerInst
                  : false;

                return (
                  <div key={districtNum} className="admin-card p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          District {districtNum}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {districtName}
                        </div>
                      </div>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase whitespace-nowrap ${
                          isAboveAvg
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {isAboveAvg ? "Above avg" : "Below avg"}
                      </span>
                    </div>
                    <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {district.total_complaints.toLocaleString()}
                    </div>
                    <div className="flex gap-4 text-[11px]">
                      <div>
                        <span className="text-gray-400">Fee-related: </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {((district.fee_related_complaints / Math.max(district.total_complaints, 1)) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Institutions: </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {district.institution_count}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400">District complaint data not yet ingested</div>
          )}
        </div>
      )}

      {/* Section 3: Beige Book District Summaries */}
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

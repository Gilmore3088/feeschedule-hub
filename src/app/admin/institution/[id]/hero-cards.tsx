import { Sparkline } from "@/components/sparkline";
import { formatAmount, formatAssets } from "@/lib/format";
import type { InstitutionFinancial } from "@/lib/crawler-db/financial";
import type { PeerRanking } from "@/lib/crawler-db/call-reports";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeroCardsProps {
  financials: InstitutionFinancial[];
  peerRanking: PeerRanking | null;
}

interface CardDef {
  label: string;
  value: string;
  sparkline: number[];
  sub: string;
  deltaValue: number | null;
  /** true = lower is better (e.g. efficiency ratio) */
  invertColors: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSeries(
  sorted: InstitutionFinancial[],
  key: keyof InstitutionFinancial,
): number[] {
  return sorted
    .map((f) => f[key])
    .filter((v): v is number => v !== null && typeof v === "number" && v > 0);
}

function qoqDelta(
  financials: InstitutionFinancial[],
  key: keyof InstitutionFinancial,
): number | null {
  const curr = financials[0]?.[key];
  const prev = financials[1]?.[key];
  if (
    typeof curr !== "number" ||
    typeof prev !== "number" ||
    curr === null ||
    prev === null ||
    prev === 0
  )
    return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function yoyDelta(
  financials: InstitutionFinancial[],
  key: keyof InstitutionFinancial,
): number | null {
  const curr = financials[0]?.[key];
  const yearAgo = financials[4]?.[key];
  if (
    typeof curr !== "number" ||
    typeof yearAgo !== "number" ||
    curr === null ||
    yearAgo === null ||
    yearAgo === 0
  )
    return null;
  return ((curr - yearAgo) / Math.abs(yearAgo)) * 100;
}

function peerPercentile(pr: PeerRanking): string {
  if (pr.peer_count === 0) return "";
  const pct = Math.round(
    ((pr.peer_count - pr.sc_rank + 1) / pr.peer_count) * 100,
  );
  return `P${pct} among ${pr.tier} peers`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeroCards({ financials, peerRanking }: HeroCardsProps) {
  if (financials.length === 0) return null;

  const latest = financials[0]; // newest first (DESC order)
  const sorted = [...financials].reverse(); // oldest first for sparklines

  // Staleness check: days since latest report_date
  const daysSince =
    (Date.now() - new Date(latest.report_date).getTime()) / (1000 * 60 * 60 * 24);
  const isStale = daysSince > 95;

  // Build sparkline data series (oldest first)
  const assetsSeries = extractSeries(sorted, "total_assets");
  const depositsSeries = extractSeries(sorted, "total_deposits");
  const scSeries = extractSeries(sorted, "service_charge_income");
  const revenueSeries = extractSeries(sorted, "total_revenue");
  const efficiencySeries = sorted
    .map((f) => f.efficiency_ratio)
    .filter((v): v is number => v !== null && typeof v === "number");
  const feeRatioSeries = sorted
    .map((f) => f.fee_income_ratio)
    .filter((v): v is number => v !== null && typeof v === "number");

  // Peer context for fee/deposit ratio
  const feeRatioSub =
    peerRanking?.peer_median_fee_ratio !== null &&
    peerRanking?.peer_median_fee_ratio !== undefined
      ? `Peer median: ${peerRanking.peer_median_fee_ratio.toFixed(2)}%`
      : "";

  // Build card definitions
  const cards: CardDef[] = [
    {
      label: "Total Assets",
      value: latest.total_assets !== null ? formatAssets(latest.total_assets) : "N/A",
      sparkline: assetsSeries,
      sub: formatDelta(qoqDelta(financials, "total_assets"), "QoQ"),
      deltaValue: qoqDelta(financials, "total_assets"),
      invertColors: false,
    },
    {
      label: "Total Deposits",
      value: latest.total_deposits !== null ? formatAssets(latest.total_deposits) : "N/A",
      sparkline: depositsSeries,
      sub: formatDelta(qoqDelta(financials, "total_deposits"), "QoQ"),
      deltaValue: qoqDelta(financials, "total_deposits"),
      invertColors: false,
    },
    {
      label: "SC Income",
      value: formatAmount(latest.service_charge_income),
      sparkline: scSeries,
      sub: peerRanking ? peerPercentile(peerRanking) : formatDelta(qoqDelta(financials, "service_charge_income"), "QoQ"),
      deltaValue: peerRanking ? null : qoqDelta(financials, "service_charge_income"),
      invertColors: false,
    },
    {
      label: "Net Income",
      value: latest.total_revenue !== null ? formatAmount(latest.total_revenue) : "N/A",
      sparkline: revenueSeries,
      sub: formatDelta(yoyDelta(financials, "total_revenue"), "YoY"),
      deltaValue: yoyDelta(financials, "total_revenue"),
      invertColors: false,
    },
    {
      label: "Efficiency Ratio",
      value: latest.efficiency_ratio !== null ? `${latest.efficiency_ratio.toFixed(1)}%` : "N/A",
      sparkline: efficiencySeries,
      sub: formatDelta(qoqDelta(financials, "efficiency_ratio"), "QoQ"),
      deltaValue: qoqDelta(financials, "efficiency_ratio"),
      invertColors: true, // lower is better
    },
    {
      label: "Fee/Deposit Ratio",
      value: latest.fee_income_ratio !== null ? `${latest.fee_income_ratio.toFixed(2)}%` : "N/A",
      sparkline: feeRatioSeries,
      sub: feeRatioSub || formatDelta(qoqDelta(financials, "fee_income_ratio"), "QoQ"),
      deltaValue: feeRatioSub ? null : qoqDelta(financials, "fee_income_ratio"),
      invertColors: false,
    },
  ];

  return (
    <div className="mb-8">
      {isStale && (
        <div className="mb-2 flex items-center gap-2">
          <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1.5 py-0.5 text-[10px] font-bold">
            Data may be stale
          </span>
          <span className="text-[10px] text-gray-400">
            Last report: {latest.report_date}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="admin-card p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {card.label}
            </p>
            <div className="flex items-end gap-3 mt-1">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {card.value}
              </span>
              {card.sparkline.length >= 2 && (
                <Sparkline data={card.sparkline} width={64} height={24} color="#3b82f6" />
              )}
            </div>
            {card.sub && (
              <p className="text-[11px] text-gray-400 mt-1">
                {card.deltaValue !== null ? (
                  <DeltaIndicator
                    value={card.deltaValue}
                    invert={card.invertColors}
                    suffix={card.sub}
                  />
                ) : (
                  card.sub
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeltaIndicator({
  value,
  invert,
  suffix,
}: {
  value: number;
  invert: boolean;
  suffix: string;
}) {
  const isPositive = value >= 0;
  // If inverted (lower is better), positive = bad, negative = good
  const isGood = invert ? !isPositive : isPositive;
  const colorClass = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <span className={colorClass}>
      {isPositive ? "+" : ""}
      {value.toFixed(1)}% {suffix.replace(/^[+-]?\d+\.?\d*%\s*/, "")}
    </span>
  );
}

function formatDelta(delta: number | null, period: string): string {
  if (delta === null) return "";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}% ${period}`;
}

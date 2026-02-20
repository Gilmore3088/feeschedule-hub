import type { DistrictMetric } from "@/lib/crawler-db";

interface DistrictNarrativeProps {
  metrics: DistrictMetric[];
}

export function DistrictNarrative({ metrics }: DistrictNarrativeProps) {
  if (metrics.length === 0) return null;

  const bestCoverage = [...metrics].sort(
    (a, b) => b.fee_url_pct - a.fee_url_pct
  )[0];
  const worstCoverage = [...metrics].sort(
    (a, b) => a.fee_url_pct - b.fee_url_pct
  )[0];
  const highestFlagRate = [...metrics].sort(
    (a, b) => b.flag_rate - a.flag_rate
  )[0];

  const parts: string[] = [];

  if (bestCoverage && bestCoverage.fee_url_pct > 0) {
    parts.push(
      `District ${bestCoverage.district} (${bestCoverage.name}) leads in coverage at ${(bestCoverage.fee_url_pct * 100).toFixed(0)}%`
    );
  }

  if (
    highestFlagRate &&
    highestFlagRate.flag_rate > 0.1 &&
    highestFlagRate.district !== bestCoverage?.district
  ) {
    parts.push(
      `District ${highestFlagRate.district} (${highestFlagRate.name}) has the highest flag rate at ${(highestFlagRate.flag_rate * 100).toFixed(0)}%`
    );
  } else if (
    worstCoverage &&
    worstCoverage.district !== bestCoverage?.district &&
    worstCoverage.fee_url_pct < bestCoverage.fee_url_pct * 0.5
  ) {
    parts.push(
      `District ${worstCoverage.district} (${worstCoverage.name}) trails at ${(worstCoverage.fee_url_pct * 100).toFixed(0)}%`
    );
  }

  if (parts.length === 0) return null;

  return (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
      {parts.join(". ")}.
    </p>
  );
}

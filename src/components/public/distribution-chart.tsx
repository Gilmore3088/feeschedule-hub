"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { MIN_N_PUBLISH, histogramWindow } from "@/lib/benchmarks/sample-policy";

interface DistributionChartProps {
  amounts: number[];
  median: number | null;
  bucketCount?: number;
}

interface Bucket {
  range: string;
  count: number;
  low: number;
  high: number;
}

/**
 * Bins amounts within the P5-P95 window (see sample-policy.ts:
 * histogramWindow) so a single extreme outlier can't stretch the x-axis and
 * flatten every other bucket. Values outside the window still count — they
 * land in the first/last bucket — matching the admin fee histogram's
 * approach (src/components/fee-histogram.tsx).
 */
function buildHistogram(amounts: number[], bucketCount: number): Bucket[] {
  if (amounts.length === 0) return [];
  const sorted = [...amounts].sort((a, b) => a - b);
  const { lo, hi } = histogramWindow(sorted);

  if (lo === hi) {
    return [{ range: `$${lo.toFixed(0)}`, count: amounts.length, low: lo, high: hi }];
  }

  const step = (hi - lo) / bucketCount;
  const buckets: Bucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const low = lo + step * i;
    const high = i === bucketCount - 1 ? hi + 0.01 : lo + step * (i + 1);
    buckets.push({ range: `$${low.toFixed(0)}`, count: 0, low, high });
  }

  for (const val of sorted) {
    const idx = Math.min(Math.max(Math.floor((val - lo) / step), 0), bucketCount - 1);
    buckets[idx].count++;
  }

  return buckets;
}

export function DistributionChart({
  amounts,
  median,
  bucketCount = 20,
}: DistributionChartProps) {
  if (amounts.length < MIN_N_PUBLISH) {
    return (
      <p className="text-sm text-[#6B6255] py-8 text-center">
        Not enough data to show a distribution (n &lt; {MIN_N_PUBLISH})
      </p>
    );
  }

  const data = buildHistogram(amounts, bucketCount);
  const medianLabel = median !== null ? `$${median.toFixed(0)}` : null;
  const hasMedianBucket = medianLabel !== null && data.some((b) => b.range === medianLabel);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD1" />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 10, fill: "#A09788" }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={{ stroke: "#E8DFD1" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#A09788" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: "1px solid #E8DFD1",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(value) => [String(value), "Institutions"]}
        />
        {hasMedianBucket && (
          <ReferenceLine
            x={medianLabel!}
            stroke="#C44B2E"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "median", position: "top", fill: "#A93D25", fontSize: 10 }}
          />
        )}
        <Bar dataKey="count" fill="#C44B2E" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

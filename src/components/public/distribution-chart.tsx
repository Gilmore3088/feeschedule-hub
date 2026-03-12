"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DistributionChartProps {
  amounts: number[];
  median: number | null;
  bucketCount?: number;
}

function buildHistogram(amounts: number[], bucketCount: number) {
  if (amounts.length === 0) return [];
  const sorted = [...amounts].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [{ range: `$${min.toFixed(0)}`, count: amounts.length }];

  const step = (max - min) / bucketCount;
  const buckets: { range: string; count: number; low: number; high: number }[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const low = min + step * i;
    const high = i === bucketCount - 1 ? max + 0.01 : min + step * (i + 1);
    buckets.push({
      range: `$${low.toFixed(0)}`,
      count: 0,
      low,
      high,
    });
  }

  for (const val of sorted) {
    const idx = Math.min(
      Math.floor((val - min) / step),
      bucketCount - 1
    );
    buckets[idx].count++;
  }

  return buckets;
}

export function DistributionChart({
  amounts,
  bucketCount = 20,
}: DistributionChartProps) {
  if (amounts.length < 3) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        Not enough data to show distribution
      </p>
    );
  }

  const data = buildHistogram(amounts, bucketCount);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
          formatter={(value) => [String(value), "Institutions"]}
        />
        <Bar dataKey="count" fill="#475569" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

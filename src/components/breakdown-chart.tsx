"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DimensionBreakdown } from "@/lib/crawler-db";

interface BreakdownChartProps {
  title: string;
  rows: DimensionBreakdown[];
  layout?: "horizontal" | "vertical";
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#64748b",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
];

interface ChartDatum {
  name: string;
  median: number;
  count: number;
  min: number | null;
  max: number | null;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const fmt = (v: number | null) =>
    v !== null ? `$${v.toFixed(2)}` : "-";

  return (
    <div className="rounded-lg border bg-white dark:bg-[oklch(0.24_0_0)] dark:border-white/[0.1] px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
        <span>Median</span>
        <span className="text-right font-mono font-semibold text-gray-900">
          {fmt(d.median)}
        </span>
        <span>Min</span>
        <span className="text-right font-mono">{fmt(d.min)}</span>
        <span>Max</span>
        <span className="text-right font-mono">{fmt(d.max)}</span>
        <span>Count</span>
        <span className="text-right">{d.count}</span>
      </div>
    </div>
  );
}

export function BreakdownChart({
  title,
  rows,
  layout = "horizontal",
}: BreakdownChartProps) {
  const data: ChartDatum[] = rows
    .filter((r) => r.median_amount !== null)
    .map((r) => ({
      name: r.dimension_value,
      median: r.median_amount!,
      count: r.count,
      min: r.min_amount,
      max: r.max_amount,
    }));

  if (data.length === 0) return null;

  const isVertical = layout === "vertical" || data.length > 6;
  const height = isVertical ? Math.max(data.length * 32, 120) : 200;

  return (
    <div className="admin-card">
      <div className="px-4 py-3 border-b bg-gray-50 dark:bg-white/[0.03]">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="px-4 py-3">
        <ResponsiveContainer width="100%" height={height}>
          {isVertical ? (
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                type="number"
                tickFormatter={(v: number) => `$${v}`}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11, fill: "#374151" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="median" radius={[0, 4, 4, 0]}>
                {data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={COLORS[idx % COLORS.length]}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              barCategoryGap="25%"
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#374151" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `$${v}`}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="median" radius={[4, 4, 0, 0]}>
                {data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={COLORS[idx % COLORS.length]}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { FeeCategorySummary } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";

interface FeeRangeChartProps {
  items: FeeCategorySummary[];
  accentColor: string;
}

interface ChartDatum {
  name: string;
  offset: number;
  iqr: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

const ACCENT_MAP: Record<string, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  amber: "#f59e0b",
  purple: "#a855f7",
  slate: "#64748b",
  cyan: "#06b6d4",
  emerald: "#10b981",
  indigo: "#6366f1",
  orange: "#f97316",
};

function resolveColor(accent: string): string {
  const key = accent.replace("border-l-", "").replace("-500", "");
  return ACCENT_MAP[key] ?? "#6b7280";
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
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900 mb-1">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
        <span>Min</span>
        <span className="text-right font-mono">{fmt(d.min)}</span>
        <span>P25</span>
        <span className="text-right font-mono">{fmt(d.p25)}</span>
        <span className="font-semibold text-gray-900">Median</span>
        <span className="text-right font-mono font-semibold text-gray-900">
          {fmt(d.median)}
        </span>
        <span>P75</span>
        <span className="text-right font-mono">{fmt(d.p75)}</span>
        <span>Max</span>
        <span className="text-right font-mono">{fmt(d.max)}</span>
      </div>
    </div>
  );
}

export function FeeRangeChart({ items, accentColor }: FeeRangeChartProps) {
  const color = resolveColor(accentColor);

  const data: ChartDatum[] = items
    .filter((i) => i.p25_amount !== null && i.p75_amount !== null)
    .map((i) => ({
      name: getDisplayName(i.fee_category),
      offset: i.p25_amount!,
      iqr: i.p75_amount! - i.p25_amount!,
      median: i.median_amount,
      p25: i.p25_amount,
      p75: i.p75_amount,
      min: i.min_amount,
      max: i.max_amount,
    }));

  if (data.length === 0) return null;

  const height = Math.max(data.length * 36, 120);

  return (
    <div className="px-4 py-3 border-t print:hidden">
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
        Fee Range (P25 - P75)
      </p>
      <ResponsiveContainer width="100%" height={height}>
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
            width={160}
            tick={{ fontSize: 12, fill: "#374151" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          {/* Invisible offset bar (transparent) */}
          <Bar dataKey="offset" stackId="range" fill="transparent" radius={0} />
          {/* IQR bar (colored) */}
          <Bar dataKey="iqr" stackId="range" radius={[0, 4, 4, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={color} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

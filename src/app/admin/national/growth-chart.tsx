"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface GrowthChartProps {
  data: { quarter: string; yoy_pct: number | null; absolute: number }[];
  label: string;
  color?: string;
}

function formatAbsolute(value: number): string {
  if (Math.abs(value) >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
  lineLabel,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  lineLabel: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-3 py-2 text-[12px]">
      <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</div>
      <div className="tabular-nums text-gray-800 dark:text-gray-200">
        {lineLabel}: {formatAbsolute(payload[0].value)}
      </div>
    </div>
  );
}

export function GrowthChart({ data, label, color = "#3b82f6" }: GrowthChartProps) {
  // DB returns newest-first; reverse so chart renders oldest-to-newest (left-to-right)
  const chartData = [...data].reverse();

  if (chartData.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="quarter"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatAbsolute}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip lineLabel={label} />} />
        <Line
          type="monotone"
          dataKey="absolute"
          name={label}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

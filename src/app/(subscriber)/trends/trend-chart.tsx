"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface TrendPoint {
  date: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${v}`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, ""]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={(label: any) => String(label)}
        />
        <Area
          dataKey="p75"
          stackId="range"
          stroke="none"
          fill="#e2e8f0"
          fillOpacity={0.4}
          name="P75"
        />
        <Area
          dataKey="p25"
          stackId="range"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
          name="P25"
        />
        <Area
          dataKey="median"
          stroke="#1e293b"
          strokeWidth={2}
          fill="none"
          dot={{ r: 3, fill: "#1e293b" }}
          name="Median"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

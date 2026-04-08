"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { ConcentrationEntry } from "@/lib/crawler-db/derived-analytics";

interface ConcentrationChartProps {
  data: ConcentrationEntry[];
}

export function ConcentrationChart({ data }: ConcentrationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 10, left: 120, bottom: 5 }}
      >
        <XAxis type="number" domain={[0, 100]} />
        <YAxis
          dataKey="fee_category"
          type="category"
          width={115}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "0.375rem",
            color: "#f3f4f6",
          }}
          formatter={(value: number | undefined) => (value !== undefined ? `${value.toFixed(1)}%` : "N/A")}
        />
        <Bar dataKey="pct_of_total" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

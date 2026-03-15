"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ChartData {
  name: string;
  value: number;
  label: string;
}

const COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9",
];

/**
 * Parse markdown tables from text and extract chartable data.
 * Returns chart data if a table has a string column + numeric column.
 */
export function extractChartData(markdown: string): ChartData[] | null {
  const tableMatch = markdown.match(
    /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/
  );
  if (!tableMatch) return null;

  const headerLine = tableMatch[1];
  const bodyLines = tableMatch[3].trim().split("\n");

  const headers = headerLine
    .split("|")
    .filter(Boolean)
    .map((h) => h.trim());

  if (headers.length < 2) return null;

  // Find first numeric column (skip the label column)
  const rows = bodyLines.map((line) =>
    line
      .split("|")
      .filter(Boolean)
      .map((c) => c.trim())
  );

  // Try to find a column with dollar amounts or numbers
  let valueColIdx = -1;
  let labelColIdx = 0;

  for (let col = 1; col < headers.length; col++) {
    const allNumeric = rows.every((row) => {
      const cell = row[col] || "";
      const cleaned = cell.replace(/[$,%]/g, "").trim();
      return !isNaN(parseFloat(cleaned)) && cleaned !== "";
    });
    if (allNumeric) {
      valueColIdx = col;
      break;
    }
  }

  if (valueColIdx === -1) return null;
  if (rows.length < 2 || rows.length > 30) return null;

  const data: ChartData[] = rows.map((row) => {
    const rawValue = (row[valueColIdx] || "").replace(/[$,%]/g, "").trim();
    return {
      name: (row[labelColIdx] || "").replace(/\*\*/g, "").substring(0, 25),
      value: parseFloat(rawValue) || 0,
      label: row[valueColIdx] || "",
    };
  });

  return data.filter((d) => d.value > 0);
}

export function InlineChart({ data }: { data: ChartData[] }) {
  const maxLabelWidth = useMemo(
    () => Math.min(Math.max(...data.map((d) => d.name.length)) * 7, 180),
    [data]
  );

  return (
    <div className="my-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/30">
      <ResponsiveContainer width="100%" height={Math.max(data.length * 32, 120)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 4, left: maxLabelWidth }}
        >
          <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={maxLabelWidth}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
            formatter={(value) => [Number(value).toLocaleString(), ""]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

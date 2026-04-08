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

interface RevenueTrendChartProps {
  data: {
    quarter: string;
    total_service_charges: number;
    bank_service_charges: number;
    cu_service_charges: number;
  }[];
}

function formatBillions(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  return `$${(value / 1_000).toFixed(0)}K`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-3 py-2 text-[12px]">
      <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span style={{ color: entry.color }} className="font-medium">
            {entry.name}:
          </span>
          <span className="tabular-nums text-gray-800 dark:text-gray-200">
            {formatBillions(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  // DB returns newest-first; reverse so chart renders oldest-to-newest (left-to-right)
  const chartData = [...data].reverse();

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-[13px] text-gray-400">
        No revenue trend data available
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatBillions}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="total_service_charges"
            name="Total"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="bank_service_charges"
            name="Banks"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="cu_service_charges"
            name="Credit Unions"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "#3b82f6" }} />
          <span className="text-[11px] text-gray-500">Total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#10b981" }} />
          <span className="text-[11px] text-gray-500">Banks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#f59e0b" }} />
          <span className="text-[11px] text-gray-500">Credit Unions</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { FeeInstance } from "@/lib/crawler-db";

interface FeeHistogramProps {
  fees: FeeInstance[];
  median: number | null;
}

interface Bucket {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  banks: number;
  creditUnions: number;
  total: number;
}

function buildBuckets(fees: FeeInstance[], bucketCount: number): Bucket[] {
  const amounts = fees
    .filter((f) => f.amount !== null && f.amount > 0)
    .map((f) => ({ amount: f.amount!, isBank: f.charter_type === "bank" }));

  if (amounts.length === 0) return [];

  const values = amounts.map((a) => a.amount);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [
      {
        label: `$${min.toFixed(0)}`,
        rangeStart: min,
        rangeEnd: max,
        banks: amounts.filter((a) => a.isBank).length,
        creditUnions: amounts.filter((a) => !a.isBank).length,
        total: amounts.length,
      },
    ];
  }

  const step = (max - min) / bucketCount;
  const buckets: Bucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = min + i * step;
    const rangeEnd = i === bucketCount - 1 ? max + 0.01 : min + (i + 1) * step;
    buckets.push({
      label: `$${rangeStart.toFixed(0)}`,
      rangeStart,
      rangeEnd,
      banks: 0,
      creditUnions: 0,
      total: 0,
    });
  }

  for (const a of amounts) {
    const idx = Math.min(
      Math.floor((a.amount - min) / step),
      bucketCount - 1
    );
    if (a.isBank) {
      buckets[idx].banks++;
    } else {
      buckets[idx].creditUnions++;
    }
    buckets[idx].total++;
  }

  return buckets;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bucket; name: string; value: number }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900 mb-1">
        ${d.rangeStart.toFixed(2)} - ${d.rangeEnd.toFixed(2)}
      </p>
      <div className="flex flex-col gap-0.5 text-gray-600">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
          Banks: {d.banks}
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
          Credit Unions: {d.creditUnions}
        </span>
        <span className="font-semibold text-gray-900 mt-0.5">
          Total: {d.total}
        </span>
      </div>
    </div>
  );
}

export function FeeHistogram({ fees, median }: FeeHistogramProps) {
  const bucketCount = Math.min(12, Math.max(5, Math.ceil(fees.length / 5)));
  const buckets = buildBuckets(fees, bucketCount);

  if (buckets.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border mb-6">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Fee Distribution
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
            Banks
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
            CUs
          </span>
          {median !== null && (
            <span>
              <span className="inline-block w-3 border-t-2 border-dashed border-red-400 mr-1 align-middle" />
              Median
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={buckets}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="15%"
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            {median !== null && (
              <ReferenceLine
                x={`$${median.toFixed(0)}`}
                stroke="#f87171"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: `Median $${median.toFixed(2)}`,
                  position: "top",
                  fill: "#ef4444",
                  fontSize: 10,
                }}
              />
            )}
            <Bar
              dataKey="banks"
              stackId="a"
              fill="#3b82f6"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="creditUnions"
              stackId="a"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

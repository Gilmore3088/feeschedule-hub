"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount as fmtAmt } from "@/lib/format";

interface DistributionPanelProps {
  category: string;
  segmentFees: { amount: number; charter_type: string }[];
  nationalFees: { amount: number; charter_type: string }[];
  segmentMedian: number | null;
  nationalMedian: number | null;
}

function buildBuckets(
  amounts: number[],
  min: number,
  max: number,
  bucketCount: number
): number[] {
  const width = (max - min) / bucketCount;
  const counts = new Array(bucketCount).fill(0);
  for (const a of amounts) {
    const idx = Math.min(Math.floor((a - min) / width), bucketCount - 1);
    counts[idx]++;
  }
  return counts;
}

export function DistributionPanel({
  category,
  segmentFees,
  nationalFees,
  segmentMedian,
  nationalMedian,
}: DistributionPanelProps) {
  if (segmentFees.length === 0 && nationalFees.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-400 mt-4">
        No distribution data available for {getDisplayName(category)}.
      </div>
    );
  }

  const allAmounts = [
    ...segmentFees.map((f) => f.amount),
    ...nationalFees.map((f) => f.amount),
  ];
  const min = Math.min(...allAmounts);
  const max = Math.max(...allAmounts);

  const bucketCount = Math.min(Math.max(Math.ceil(Math.sqrt(allAmounts.length)), 5), 15);
  const width = (max - min) / bucketCount;

  const segCounts = buildBuckets(
    segmentFees.map((f) => f.amount),
    min,
    max,
    bucketCount
  );
  const natCounts = buildBuckets(
    nationalFees.map((f) => f.amount),
    min,
    max,
    bucketCount
  );

  const data = Array.from({ length: bucketCount }, (_, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    return {
      range: `${fmtAmt(lo)}-${fmtAmt(hi)}`,
      rangeMin: lo,
      segment: segCounts[i],
      national: natCounts[i],
    };
  });

  const segStats = {
    count: segmentFees.length,
    min: segmentFees.length > 0 ? Math.min(...segmentFees.map((f) => f.amount)) : null,
    max: segmentFees.length > 0 ? Math.max(...segmentFees.map((f) => f.amount)) : null,
  };

  return (
    <div className="rounded-lg border bg-white mt-4">
      <div className="px-5 py-3 border-b bg-gray-50/80 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">
          {getDisplayName(category)}{" "}
          <span className="font-normal text-gray-400">
            Segment vs. National
          </span>
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-gray-400 tabular-nums">
          <span>
            Segment: {segmentFees.length} obs
          </span>
          <span>
            National: {nationalFees.length} obs
          </span>
        </div>
      </div>

      <div className="p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
            <Legend
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar
              dataKey="national"
              name="National"
              fill="#d1d5db"
              opacity={0.5}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="segment"
              name="Segment"
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
            {segmentMedian !== null && (
              <ReferenceLine
                x={data.find(
                  (d) =>
                    segmentMedian! >= d.rangeMin &&
                    segmentMedian! < d.rangeMin + width
                )?.range}
                stroke="#2563eb"
                strokeDasharray="4 2"
                label={{
                  value: `Seg Med ${fmtAmt(segmentMedian)}`,
                  position: "top",
                  fontSize: 10,
                  fill: "#2563eb",
                }}
              />
            )}
            {nationalMedian !== null && (
              <ReferenceLine
                x={data.find(
                  (d) =>
                    nationalMedian! >= d.rangeMin &&
                    nationalMedian! < d.rangeMin + width
                )?.range}
                stroke="#9ca3af"
                strokeDasharray="4 2"
                label={{
                  value: `Nat Med ${fmtAmt(nationalMedian)}`,
                  position: "top",
                  fontSize: 10,
                  fill: "#6b7280",
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-3 text-[11px] text-gray-400 tabular-nums">
          {segStats.min !== null && (
            <span>Min: {fmtAmt(segStats.min)}</span>
          )}
          {segmentMedian !== null && (
            <span className="font-semibold text-gray-600">
              Median: {fmtAmt(segmentMedian)}
            </span>
          )}
          {segStats.max !== null && (
            <span>Max: {fmtAmt(segStats.max)}</span>
          )}
          {segStats.min !== null && segStats.max !== null && (
            <span>
              Spread: {fmtAmt(segStats.max - segStats.min)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

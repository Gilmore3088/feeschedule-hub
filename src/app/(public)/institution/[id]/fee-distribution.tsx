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

interface InstitutionHistogramProps {
  categoryName: string;
  institutionName: string;
  institutionAmount: number;
  fees: { amount: number; charter_type: string }[];
  median: number | null;
}

interface Bucket {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

function buildBuckets(
  fees: { amount: number }[],
  bucketCount: number
): Bucket[] {
  const amounts = fees
    .filter((f) => f.amount !== null && f.amount >= 0)
    .map((f) => f.amount)
    .sort((a, b) => a - b);

  if (amounts.length === 0) return [];

  const p5Idx = Math.floor(amounts.length * 0.05);
  const p95Idx = Math.min(
    Math.floor(amounts.length * 0.95),
    amounts.length - 1
  );
  const min = amounts[p5Idx];
  const max = amounts[p95Idx];

  if (min === max) {
    return [
      {
        label: `$${min.toFixed(0)}`,
        rangeStart: min,
        rangeEnd: max,
        count: amounts.length,
      },
    ];
  }

  const rawStep = (max - min) / bucketCount;
  const step =
    rawStep <= 1
      ? 1
      : rawStep <= 5
        ? 5
        : rawStep <= 10
          ? 10
          : Math.ceil(rawStep / 5) * 5;
  const roundedMin = Math.floor(min / step) * step;

  const buckets: Bucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = roundedMin + i * step;
    const rangeEnd = roundedMin + (i + 1) * step;
    buckets.push({
      label: `$${rangeStart.toFixed(0)}`,
      rangeStart,
      rangeEnd,
      count: 0,
    });
  }

  for (const amount of amounts) {
    let idx = Math.floor((amount - roundedMin) / step);
    idx = Math.max(0, Math.min(idx, bucketCount - 1));
    buckets[idx].count++;
  }

  return buckets;
}

function ConsumerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bucket }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E8DFD1] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-[#1A1815]">
        ${d.rangeStart.toFixed(0)} – ${d.rangeEnd.toFixed(0)}
      </p>
      <p className="text-[#7A7062]">{d.count} institutions</p>
    </div>
  );
}

export function InstitutionHistogram({
  categoryName,
  institutionName,
  institutionAmount,
  fees,
  median,
}: InstitutionHistogramProps) {
  const bucketCount = Math.min(10, Math.max(5, Math.ceil(fees.length / 8)));
  const buckets = buildBuckets(fees, bucketCount);

  if (buckets.length === 0) return null;

  const bucketStep =
    buckets.length > 1
      ? buckets[1].rangeStart - buckets[0].rangeStart
      : buckets[0].rangeEnd - buckets[0].rangeStart || 1;
  const firstRange = buckets[0].rangeStart;

  const medianLabel =
    median !== null ? `$${median.toFixed(0)}` : null;

  const instBucketIdx = Math.max(
    0,
    Math.min(
      buckets.length - 1,
      Math.floor((institutionAmount - firstRange) / bucketStep)
    )
  );
  const instBucketLabel = buckets[instBucketIdx]?.label ?? `$${institutionAmount.toFixed(0)}`;

  return (
    <div className="rounded-xl border border-[#E8DFD1]/80 bg-white/70 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A09788]">
        {categoryName}
      </p>
      <p className="mt-0.5 text-[10px] text-[#5A5347]">
        This bank: ${institutionAmount.toFixed(0)}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={buckets}
          margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
          barCategoryGap="10%"
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#A09788" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#A09788" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={<ConsumerTooltip />}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          {medianLabel !== null && (
            <ReferenceLine
              x={medianLabel}
              stroke="#A09788"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `Median ${medianLabel}`,
                position: "top",
                fill: "#A09788",
                fontSize: 9,
              }}
            />
          )}
          <ReferenceLine
            x={instBucketLabel}
            stroke="#C44B2E"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{
              value: `${institutionName}: $${institutionAmount.toFixed(0)}`,
              position: "top",
              fill: "#C44B2E",
              fontSize: 9,
            }}
          />
          <Bar dataKey="count" fill="#D4C9BA" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

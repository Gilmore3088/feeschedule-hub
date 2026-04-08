"use client";

import { Sparkline } from "@/components/sparkline";
import type { FeeDependencyTrend } from "@/lib/crawler-db/derived-analytics";

function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") {
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">↑</span>;
  }
  if (trend === "falling") {
    return <span className="text-red-500 dark:text-red-400 text-xs font-bold">↓</span>;
  }
  return <span className="text-gray-400 text-xs font-bold">→</span>;
}

interface DependencyChartProps {
  trend: FeeDependencyTrend;
}

export function DependencyChart({ trend }: DependencyChartProps) {
  return (
    <>
      <div className="flex gap-3 text-[11px] pt-1">
        {trend.signals.qoq_change_pct !== null && (
          <div className="flex items-center gap-1">
            <TrendArrow
              trend={
                trend.signals.qoq_change_pct > 0
                  ? "rising"
                  : trend.signals.qoq_change_pct < 0
                    ? "falling"
                    : "stable"
              }
            />
            <span
              className={`font-semibold ${
                trend.signals.qoq_change_pct > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : trend.signals.qoq_change_pct < 0
                    ? "text-red-500 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {trend.signals.qoq_change_pct >= 0 ? "+" : ""}
              {trend.signals.qoq_change_pct.toFixed(1)}% QoQ
            </span>
          </div>
        )}
        {trend.signals.yoy_change_pct !== null && (
          <div className="flex items-center gap-1">
            <TrendArrow
              trend={
                trend.signals.yoy_change_pct > 0
                  ? "rising"
                  : trend.signals.yoy_change_pct < 0
                    ? "falling"
                    : "stable"
              }
            />
            <span
              className={`font-semibold ${
                trend.signals.yoy_change_pct > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : trend.signals.yoy_change_pct < 0
                    ? "text-red-500 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {trend.signals.yoy_change_pct >= 0 ? "+" : ""}
              {trend.signals.yoy_change_pct.toFixed(1)}% YoY
            </span>
          </div>
        )}
      </div>

      <div className="pt-2">
        <Sparkline
          data={[...trend.trend].reverse().map((t) => t.avg_fee_income_ratio)}
          width={200}
          height={24}
          color="#6366f1"
        />
      </div>
    </>
  );
}

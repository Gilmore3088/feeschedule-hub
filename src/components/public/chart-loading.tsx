/**
 * Same-height placeholder for the client-only DistributionChart (loaded via
 * next/dynamic with ssr:false — recharts' ResponsiveContainer measures the
 * DOM, which only exists client-side, and rendering it during SSR is a
 * common source of hydration mismatches). Matches the chart's own h-64
 * wrapper so there's no layout shift once the real chart mounts.
 */
export function ChartLoading() {
  return (
    <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
  );
}

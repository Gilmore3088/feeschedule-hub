"use client";

import dynamic from "next/dynamic";
import { ChartLoading } from "./chart-loading";

/**
 * next/dynamic's `ssr: false` can only be used from a Client Component (Next
 * throws a build error if a Server Component calls it directly), so this
 * thin client wrapper is what the category/guide Server Component pages
 * import instead of `distribution-chart.tsx` directly. recharts'
 * ResponsiveContainer measures the DOM, which only exists client-side —
 * SSR-ing it is a known hydration-mismatch source.
 */
export const DistributionChart = dynamic(
  () => import("./distribution-chart").then((m) => m.DistributionChart),
  { ssr: false, loading: () => <ChartLoading /> },
);

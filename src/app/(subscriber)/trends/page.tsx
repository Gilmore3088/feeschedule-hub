import type { Metadata } from "next";
import { requireActiveSubscription } from "@/lib/subscriber-auth";
import {
  getCategoryTrend,
  getTrendingCategories,
} from "@/lib/crawler-db/historical";
import { getSpotlightCategories } from "@/lib/fee-taxonomy";
import { TrendChart } from "./trend-chart";

export const metadata: Metadata = {
  title: "Historical Trends",
  description: "12-month fee trend analysis across U.S. banking institutions",
};

export default async function TrendsPage(props: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireActiveSubscription();
  const searchParams = await props.searchParams;

  const spotlight = getSpotlightCategories();
  const trending = getTrendingCategories(15);

  // Default to first spotlight category or first trending
  const selectedCategory =
    searchParams.category || spotlight[0] || trending[0]?.fee_category;

  const trend = selectedCategory
    ? getCategoryTrend(selectedCategory, 12)
    : null;

  const hasData = trend && trend.points.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Historical Trends
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        12-month fee median trends across U.S. banking institutions
      </p>

      {/* Category selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(trending.length > 0 ? trending : spotlight.map((c) => ({ fee_category: c, display_name: c.replace(/_/g, " "), snapshot_count: 0 }))).map(
          (cat) => {
            const isActive = cat.fee_category === selectedCategory;
            return (
              <a
                key={cat.fee_category}
                href={`/trends?category=${cat.fee_category}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {cat.display_name}
              </a>
            );
          }
        )}
      </div>

      {/* Chart */}
      <div className="mt-8">
        {hasData ? (
          <div className="rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900">
              {trend.display_name}
            </h2>
            {trend.fee_family && (
              <span className="text-xs text-slate-400">{trend.fee_family}</span>
            )}
            <div className="mt-4" style={{ height: 320 }}>
              <TrendChart points={trend.points} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 p-12 text-center">
            <h2 className="text-lg font-bold text-slate-900">
              No trend data yet
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Historical trend data is being collected. As more crawl snapshots
              accumulate, trends will appear here automatically.
            </p>
          </div>
        )}
      </div>

      {/* Data table */}
      {hasData && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Month
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Median
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  P25
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  P75
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Observations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trend.points.map((pt) => (
                <tr key={pt.date} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {pt.date}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {pt.median != null ? `$${pt.median.toFixed(2)}` : "--"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {pt.p25 != null ? `$${pt.p25.toFixed(2)}` : "--"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {pt.p75 != null ? `$${pt.p75.toFixed(2)}` : "--"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                    {pt.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

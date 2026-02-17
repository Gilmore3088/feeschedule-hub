import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getDistrictMetrics,
  getBeigeBookHeadlines,
  getBeigeBookEditions,
} from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { timeAgo } from "@/lib/format";

export default async function DistrictsIndexPage() {
  await requireAuth("view");

  const metrics = getDistrictMetrics();
  const headlines = getBeigeBookHeadlines();
  const editions = getBeigeBookEditions(1);
  const latestEdition = editions[0] ?? null;

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Districts" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Federal Reserve Districts
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Regional economic context from Beige Book, Fed speeches, and FRED
          indicators
          {latestEdition && (
            <span className="ml-2 text-gray-400">
              &middot; Latest Beige Book: {timeAgo(latestEdition.release_date)}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => {
          const metric = metrics.find((m) => m.district === d);
          const headline = headlines.get(d);
          return (
            <Link
              key={d}
              href={`/admin/districts/${d}`}
              className="rounded-lg border bg-white p-4 hover:border-gray-300 hover:shadow-sm transition group"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {d} &mdash; {DISTRICT_NAMES[d]}
                </h2>
                {metric && (
                  <span className="text-[11px] text-gray-400 tabular-nums">
                    {metric.institution_count.toLocaleString()} institutions
                  </span>
                )}
              </div>
              {metric && (
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 tabular-nums">
                  <span>
                    {(metric.fee_url_pct * 100).toFixed(0)}% fee URLs
                  </span>
                  <span>{metric.total_fees.toLocaleString()} fees</span>
                  <span>
                    {(metric.avg_confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              )}
              {headline ? (
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {headline.text}
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No Beige Book data yet
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}

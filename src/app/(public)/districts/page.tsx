import Link from "next/link";
import type { Metadata } from "next";
import { getDistrictMetrics, getBeigeBookHeadlines } from "@/lib/crawler-db";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

export const metadata: Metadata = {
  title: "Fed Districts - Regional Banking Fee Data | Bank Fee Index",
  description:
    "Explore banking fee benchmarks across all 12 Federal Reserve districts. See regional fee comparisons, Beige Book economic context, and institution data.",
};

export const revalidate = 86400;

export default function DistrictsPage() {
  const metrics = getDistrictMetrics();
  const headlines = getBeigeBookHeadlines();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Federal Reserve Districts
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Regional banking fee benchmarks and economic context across all 12 Fed
          districts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((districtId) => {
          const metric = metrics.find((m) => m.district === districtId);
          const headline = headlines.get(districtId);

          return (
            <Link
              key={districtId}
              href={`/districts/${districtId}`}
              className="group rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  District {districtId} - {DISTRICT_NAMES[districtId]}
                </h2>
                <span className="text-[10px] font-semibold text-slate-400">
                  {districtId}
                </span>
              </div>

              {metric && (
                <div className="mb-3 flex gap-4 text-[12px] text-slate-500">
                  <span>
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {metric.institution_count.toLocaleString()}
                    </span>{" "}
                    institutions
                  </span>
                  <span>
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {metric.total_fees?.toLocaleString() ?? "0"}
                    </span>{" "}
                    fees
                  </span>
                </div>
              )}

              {headline && (
                <p className="text-[12px] leading-relaxed text-slate-400 line-clamp-2">
                  {headline.text}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

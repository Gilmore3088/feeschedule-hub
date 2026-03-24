export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getDistrictOverview } from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function DistrictsPage() {
  await requireAuth("view");

  let districts: Awaited<ReturnType<typeof getDistrictOverview>> = [];

  try {
    districts = await getDistrictOverview();
  } catch (e) {
    console.error("Districts page load failed:", e);
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/admin" }, { label: "Districts" }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Federal Reserve Districts
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Coverage and fee extraction by Fed district
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {districts.map((d) => (
          <Link
            key={d.district}
            href={`/admin/districts/${d.district}`}
            className="admin-card p-4 hover:shadow-sm transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {d.district} &mdash; {d.name}
              </h2>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                District
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Institutions
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">
                  {d.total.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  With Fees
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">
                  {d.with_fees.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Coverage
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">
                  {d.pct}%
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all"
                style={{ width: `${d.pct}%` }}
              />
            </div>
          </Link>
        ))}
        {districts.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-gray-400">
            No district data available
          </div>
        )}
      </div>
    </div>
  );
}

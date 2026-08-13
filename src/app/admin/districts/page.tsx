export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getDistrictOverview } from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SortableTable, type Column } from "@/components/sortable-table";

type DistrictRow = {
  district: number;
  name: string;
  states: string[];
  total: number;
  with_urls: number;
  with_fees: number;
  url_but_zero: number;
  latest_failed: number;
  extracted_not_published: number;
  pct: number;
} & Record<string, unknown>;

const columns: Column<DistrictRow>[] = [
  {
    key: "district",
    label: "District",
    sortable: true,
    align: "right",
    format: (_, row) => (
      <Link
        href={`/admin/districts/${row.district}`}
        className="text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors font-medium"
      >
        {row.district as number}
      </Link>
    ),
  },
  {
    key: "name",
    label: "Name",
    sortable: true,
    format: (_, row) => (
      <Link
        href={`/admin/districts/${row.district}`}
        className="text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors"
      >
        {row.name as string}
      </Link>
    ),
  },
  {
    key: "states",
    label: "States",
    sortable: false,
    format: (_, row) => (
      <div className="flex max-w-md flex-wrap gap-1">
        {row.states.map((code) => (
          <Link
            key={code}
            href={`/admin/states/${code}`}
            className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:border-blue-200 hover:text-blue-700 dark:border-white/[0.08] dark:text-gray-400 dark:hover:border-blue-900/60 dark:hover:text-blue-300"
          >
            {code}
          </Link>
        ))}
      </div>
    ),
  },
  {
    key: "total",
    label: "Institutions",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "with_urls",
    label: "With URLs",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "with_fees",
    label: "Published",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "url_but_zero",
    label: "URL, Zero Fees",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_failed",
    label: "Latest Failed",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "pct",
    label: "Coverage",
    sortable: true,
    align: "right",
    format: (v) => `${v}%`,
  },
];

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
          Coverage, mapped states, and fee publication status by Fed district
        </p>
        <div className="mt-3">
          <Link
            href="/admin/states"
            className="inline-flex rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/[0.08] dark:text-gray-300 dark:hover:border-blue-900/60 dark:hover:text-blue-300"
          >
            View states
          </Link>
        </div>
      </div>

      {districts.length > 0 ? (
        <Suspense fallback={null}>
          <SortableTable
            columns={columns}
            rows={districts as DistrictRow[]}
            defaultSort="name"
            defaultDir="asc"
            rowKey={(r) => String(r.district)}
          />
        </Suspense>
      ) : (
        <div className="text-center py-12 text-sm text-gray-400">
          No district data available
        </div>
      )}
    </div>
  );
}

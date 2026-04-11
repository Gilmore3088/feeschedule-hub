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
  total: number;
  with_fees: number;
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
    key: "total",
    label: "Institutions",
    sortable: true,
    align: "right",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "with_fees",
    label: "With Fees",
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
          Coverage and fee extraction by Fed district
        </p>
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

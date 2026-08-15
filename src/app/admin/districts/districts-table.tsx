"use client";

import { Suspense } from "react";
import Link from "next/link";
import { SortableTable, type Column } from "@/components/sortable-table";
import type { getDistrictOverview } from "@/lib/admin-queries";

type DistrictOverviewRow = Awaited<ReturnType<typeof getDistrictOverview>>[number];
type DistrictRow = DistrictOverviewRow & Record<string, unknown>;

const columns: Column<DistrictRow>[] = [
  {
    key: "district",
    label: "District",
    sortable: true,
    align: "right",
    format: (_, row) => (
      <Link
        href={`/admin/districts/${row.district}`}
        className="font-medium text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100"
      >
        {row.district}
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
        className="text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100"
      >
        {row.name}
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

export function DistrictsTable({
  districts,
}: {
  districts: DistrictOverviewRow[];
}) {
  return (
    <Suspense fallback={null}>
      <SortableTable
        columns={columns}
        rows={districts as DistrictRow[]}
        defaultSort="name"
        defaultDir="asc"
        rowKey={(row) => String(row.district)}
      />
    </Suspense>
  );
}

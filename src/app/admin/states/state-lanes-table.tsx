"use client";

import { Suspense } from "react";
import Link from "next/link";
import { SortableTable, type Column } from "@/components/sortable-table";
import type { StateOverviewRow } from "@/lib/admin-queries";

type StateRow = StateOverviewRow & Record<string, unknown>;

const columns: Column<StateRow>[] = [
  {
    key: "state_code",
    label: "State",
    sortable: true,
    format: (_, row) => (
      <Link
        href={`/admin/states/${row.state_code}`}
        className="font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100"
      >
        {row.state_code}
      </Link>
    ),
  },
  {
    key: "name",
    label: "Name",
    sortable: true,
    format: (_, row) => (
      <Link
        href={`/admin/states/${row.state_code}`}
        className="text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100"
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: "district",
    label: "District",
    sortable: true,
    align: "right",
    format: (_, row) =>
      row.district ? (
        <Link
          href={`/admin/districts/${row.district}`}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {row.district} - {row.district_name}
        </Link>
      ) : (
        <span className="text-gray-400">-</span>
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

export function StateLanesTable({
  states,
  caption,
}: {
  states: StateOverviewRow[];
  caption: string;
}) {
  return (
    <Suspense fallback={null}>
      <SortableTable
        columns={columns}
        rows={states as StateRow[]}
        defaultSort="total"
        defaultDir="desc"
        pageSize={60}
        rowKey={(row) => row.state_code}
        caption={caption}
      />
    </Suspense>
  );
}

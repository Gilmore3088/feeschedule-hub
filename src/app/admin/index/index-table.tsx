"use client";

import Link from "next/link";
import { SortableTable, type Column } from "@/components/sortable-table";
import { formatAmount } from "@/lib/format";

interface IndexRow {
  fee_category: string;
  display_name: string;
  fee_family: string | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  institution_count: number;
  bank_count: number;
  cu_count: number;
  maturity: string;
}

function maturityColor(m: string): string {
  switch (m) {
    case "strong":
      return "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "provisional":
      return "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500";
  }
}

const columns: Column<IndexRow>[] = [
  {
    key: "display_name",
    label: "Category",
    sortable: true,
    format: (_, row) => (
      <Link
        href={`/admin/fees/catalog/${row.fee_category}`}
        className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
      >
        {row.display_name}
      </Link>
    ),
  },
  {
    key: "fee_family",
    label: "Family",
    sortable: true,
    format: (v) => (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {(v as string) ?? "-"}
      </span>
    ),
  },
  {
    key: "median",
    label: "Median",
    align: "right",
    sortable: true,
    format: (v) => (
      <span className="font-semibold text-gray-900 dark:text-gray-100">
        {formatAmount(v as number | null)}
      </span>
    ),
  },
  {
    key: "p25",
    label: "P25",
    align: "right",
    sortable: true,
    format: (v) => (
      <span className="text-gray-600 dark:text-gray-400">
        {formatAmount(v as number | null)}
      </span>
    ),
  },
  {
    key: "p75",
    label: "P75",
    align: "right",
    sortable: true,
    format: (v) => (
      <span className="text-gray-600 dark:text-gray-400">
        {formatAmount(v as number | null)}
      </span>
    ),
  },
  {
    key: "institution_count",
    label: "Institutions",
    align: "right",
    sortable: true,
    format: (_, row) => (
      <>
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.institution_count}</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">
          ({row.bank_count}b/{row.cu_count}c)
        </span>
      </>
    ),
  },
  {
    key: "maturity",
    label: "Maturity",
    align: "center",
    sortable: true,
    format: (v) => (
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${maturityColor(v as string)}`}
      >
        {v as string}
      </span>
    ),
  },
];

export function IndexTable({ entries }: { entries: IndexRow[] }) {
  return (
    <SortableTable
      columns={columns}
      rows={entries as (IndexRow & Record<string, unknown>)[]}
      rowKey={(r) => r.fee_category}
      defaultSort="institution_count"
      defaultDir="desc"
      pageSize={100}
    />
  );
}

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SortableTable, type Column } from "@/components/sortable-table";
import { getStateOverview } from "@/lib/admin-queries";

type StateRow = Awaited<ReturnType<typeof getStateOverview>>[number] &
  Record<string, unknown>;

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

export default async function StatesPage() {
  await requireAuth("view");

  let states: Awaited<ReturnType<typeof getStateOverview>> = [];
  try {
    states = await getStateOverview();
  } catch (e) {
    console.error("States page load failed:", e);
  }

  const activeStates = states.filter((state) => state.total > 0);
  const totals = states.reduce(
    (acc, state) => ({
      institutions: acc.institutions + state.total,
      withUrls: acc.withUrls + state.with_urls,
      published: acc.published + state.with_fees,
      urlButZero: acc.urlButZero + state.url_but_zero,
      latestFailed: acc.latestFailed + state.latest_failed,
    }),
    { institutions: 0, withUrls: 0, published: 0, urlButZero: 0, latestFailed: 0 },
  );

  return (
    <div className="space-y-6">
      <header>
        <Breadcrumbs
          items={[{ label: "Atlas", href: "/admin" }, { label: "State Lanes" }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          State Lanes
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          State-sized work partitions for source memory, coverage, publication status, and repair backlog.
        </p>
        <div className="mt-3">
          <Link
            href="/admin/districts"
            className="inline-flex rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/[0.08] dark:text-gray-300 dark:hover:border-blue-900/60 dark:hover:text-blue-300"
          >
            View districts
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <StatCard label="Active States" value={activeStates.length.toLocaleString()} />
        <StatCard label="Institutions" value={totals.institutions.toLocaleString()} />
        <StatCard label="With URLs" value={totals.withUrls.toLocaleString()} />
        <StatCard label="Published" value={totals.published.toLocaleString()} />
        <StatCard label="URL, Zero Fees" value={totals.urlButZero.toLocaleString()} />
      </div>

      {states.length > 0 ? (
        <Suspense fallback={null}>
          <SortableTable
            columns={columns}
            rows={states as StateRow[]}
            defaultSort="total"
            defaultDir="desc"
            pageSize={60}
            rowKey={(row) => row.state_code}
            caption={`${totals.latestFailed.toLocaleString()} institutions have a latest failed source document.`}
          />
        </Suspense>
      ) : (
        <div className="py-12 text-center text-sm text-gray-400">
          No state data available
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card p-4">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </p>
    </div>
  );
}

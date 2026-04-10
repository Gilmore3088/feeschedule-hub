import Link from "next/link";
import { Suspense } from "react";
import { sql } from "@/lib/crawler-db/connection";
import { timeAgo } from "@/lib/format";
import { SortableTable, type Column } from "@/components/sortable-table";

interface DataSource {
  name: string;
  table: string;
  dateColumn: string;
  cadence: string;
  cadenceDays: number;
  refreshCommand?: string;
}

const DATA_SOURCES: DataSource[] = [
  { name: "FRED Economic Indicators", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7, refreshCommand: "daily" },
  { name: "BLS CPI", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7, refreshCommand: "daily" },
  { name: "NY Fed Rates", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Daily", cadenceDays: 1, refreshCommand: "daily" },
  { name: "OFR Stress Index", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Daily", cadenceDays: 1, refreshCommand: "daily" },
  { name: "CFPB Complaints", table: "institution_complaints", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7, refreshCommand: "weekly" },
  { name: "FDIC Financials", table: "institution_financials", dateColumn: "fetched_at", cadence: "Quarterly", cadenceDays: 90, refreshCommand: "quarterly" },
  { name: "Fed Beige Book", table: "fed_beige_book", dateColumn: "fetched_at", cadence: "8x/year", cadenceDays: 45, refreshCommand: "weekly" },
  { name: "Fed Speeches", table: "fed_content", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7, refreshCommand: "weekly" },
  { name: "SOD Branch Deposits", table: "branch_deposits", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
  { name: "Census Demographics", table: "demographics", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
  { name: "Census Tracts", table: "census_tracts", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
];

interface SourceRow extends Record<string, unknown> {
  name: string;
  rowCount: number;
  lastRefresh: string | null;
  cadence: string;
  overdue: boolean;
  refreshCommand?: string;
}

async function getRefreshTimestamps(): Promise<SourceRow[]> {
  const results: SourceRow[] = [];
  for (const src of DATA_SOURCES) {
    try {
      const rows = await sql.unsafe(`SELECT MAX(${src.dateColumn}) as last_refresh, COUNT(*) as cnt FROM ${src.table}`);
      const row = rows[0];
      const lastRefresh = row.last_refresh as string | null;
      let overdue = false;
      if (lastRefresh) {
        const daysSince = (Date.now() - new Date(lastRefresh).getTime()) / (1000 * 60 * 60 * 24);
        overdue = daysSince > src.cadenceDays * 1.5;
      }
      results.push({ name: src.name, lastRefresh, cadence: src.cadence, overdue, rowCount: Number(row.cnt), refreshCommand: src.refreshCommand });
    } catch {
      results.push({ name: src.name, lastRefresh: null, cadence: src.cadence, overdue: true, rowCount: 0, refreshCommand: src.refreshCommand });
    }
  }
  return results;
}

const columns: Column<SourceRow>[] = [
  {
    key: "name",
    label: "Source",
    sortable: true,
    format: (_, row) => <span className="text-gray-700 dark:text-gray-300">{row.name as string}</span>,
  },
  {
    key: "rowCount",
    label: "Rows",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-500">{(v as number).toLocaleString()}</span>,
  },
  {
    key: "lastRefresh",
    label: "Last Refresh",
    align: "right",
    sortable: true,
    format: (v) => (
      <span className="tabular-nums text-gray-500">
        {v ? timeAgo(v as string) : "Never"}
      </span>
    ),
  },
  {
    key: "cadence",
    label: "Cadence",
    align: "right",
    sortable: true,
    format: (v) => <span className="text-gray-400">{v as string}</span>,
  },
  {
    key: "overdue",
    label: "Status",
    align: "center",
    sortable: true,
    format: (_, row) => {
      const rowCount = row.rowCount as number;
      const overdue = row.overdue as boolean;
      if (rowCount === 0) {
        return (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" aria-hidden="true" title="No data" />
            <span className="sr-only">No data</span>
          </>
        );
      }
      if (overdue) {
        return (
          <Link
            href="/admin/ops"
            className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors"
            title={`Overdue — use Quick Actions to run Refresh ${(row.refreshCommand as string) || "data"}`}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
            overdue
          </Link>
        );
      }
      return (
        <>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" title="Current" />
          <span className="sr-only">Current</span>
        </>
      );
    },
  },
];

export async function DataSourcesStatus() {
  const sources = await getRefreshTimestamps();

  return (
    <div>
      <div className="px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Data Sources
        </h3>
        <div className="flex gap-1 text-[10px]">
          <span className="text-gray-400">{sources.filter((s) => !s.overdue && s.rowCount > 0).length} current</span>
          {sources.some((s) => s.overdue) && (
            <span className="text-amber-500">{sources.filter((s) => s.overdue).length} overdue</span>
          )}
        </div>
      </div>
      <Suspense fallback={null}>
        <SortableTable
          columns={columns}
          rows={sources}
          rowKey={(r) => r.name as string}
          defaultSort="name"
          defaultDir="asc"
          pageSize={20}
        />
      </Suspense>
    </div>
  );
}

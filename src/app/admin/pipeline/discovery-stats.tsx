import { Suspense } from "react";
import { getDiscoveryMethodStats } from "@/lib/crawler-db/pipeline-runs";
import { SortableTable, type Column } from "@/components/sortable-table";

interface DiscoveryRow extends Record<string, unknown> {
  discovery_method: string;
  discovered: number;
  crawl_success: number;
  prescreen_fail: number;
  http_error: number;
  success_rate: number;
}

const columns: Column<DiscoveryRow>[] = [
  {
    key: "discovery_method",
    label: "Method",
    sortable: true,
    format: (v) => (
      <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
        {(v as string).replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "discovered",
    label: "Found",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">{v as number}</span>,
  },
  {
    key: "crawl_success",
    label: "Crawled",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{v as number}</span>,
  },
  {
    key: "prescreen_fail",
    label: "Pre-screen Fail",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-amber-600 dark:text-amber-400">{v as number}</span>,
  },
  {
    key: "http_error",
    label: "HTTP Error",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-red-600 dark:text-red-400">{v as number}</span>,
  },
  {
    key: "success_rate",
    label: "Success Rate",
    align: "right",
    sortable: true,
    format: (v) => {
      const rate = v as number;
      return (
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                rate >= 50 ? "bg-emerald-500" : rate >= 30 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${rate}%` }}
            />
          </div>
          <span className={`tabular-nums font-medium ${
            rate >= 50 ? "text-emerald-600 dark:text-emerald-400"
              : rate >= 30 ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400"
          }`}>
            {rate}%
          </span>
        </div>
      );
    },
  },
];

export async function DiscoveryStats() {
  const stats = await getDiscoveryMethodStats();

  if (stats.length === 0) return null;

  return (
    <div>
      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Discovery Method Quality
        </h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Which URL discovery methods produce crawlable fee schedules
        </p>
      </div>
      <Suspense fallback={null}>
        <SortableTable
          columns={columns}
          rows={stats as DiscoveryRow[]}
          rowKey={(r) => r.discovery_method as string}
          defaultSort="discovery_method"
          defaultDir="asc"
          pageSize={20}
        />
      </Suspense>
    </div>
  );
}

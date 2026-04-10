export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getPipelineOverview,
  getRecentCrawlRuns,
  getRecentJobs,
  getJobQueueStatus,
  getDiscoveryStatus,
} from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function PipelinePage() {
  await requireAuth("view");

  let overview = { total_institutions: 0, with_url: 0, with_fees: 0, crawl_runs: 0 };
  let crawlRuns: Awaited<ReturnType<typeof getRecentCrawlRuns>> = [];
  let jobs: Awaited<ReturnType<typeof getRecentJobs>> = [];
  let queueStatus: Awaited<ReturnType<typeof getJobQueueStatus>> = [];
  let discoveryStatus: Awaited<ReturnType<typeof getDiscoveryStatus>> = [];

  try {
    [overview, crawlRuns, jobs, queueStatus, discoveryStatus] = await Promise.all([
      getPipelineOverview(),
      getRecentCrawlRuns(15),
      getRecentJobs(20),
      getJobQueueStatus(),
      getDiscoveryStatus(),
    ]);
  } catch (e) {
    console.error("Pipeline data load failed:", e);
  }

  const urlPct = overview.total_institutions > 0
    ? Math.round((overview.with_url / overview.total_institutions) * 100)
    : 0;

  return (
    <>
      <div className="mb-5">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Pipeline" }]} />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Data Pipeline
        </h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Crawl operations, jobs, and discovery status
        </p>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8">
        <PipelineStatCard label="Institutions" value={formatNumber(overview.total_institutions)} />
        <PipelineStatCard label="With Fee URL" value={formatNumber(overview.with_url)} sub={`${urlPct}%`} />
        <PipelineStatCard label="With Fees" value={formatNumber(overview.with_fees)} />
        <PipelineStatCard label="Crawl Runs" value={formatNumber(overview.crawl_runs)} />
      </div>

      {/* Discovery + Job Queue Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Discovery Queue */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Job Status Summary
            </h2>
          </div>
          {discoveryStatus.length > 0 ? (
            <div className="p-4 grid grid-cols-2 gap-2">
              {discoveryStatus.map((d) => (
                <div key={d.status} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-white/[0.06] px-3 py-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{d.status}</span>
                  <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatNumber(d.count)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">No job data</div>
          )}
        </div>

        {/* Job Queue Breakdown */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Jobs by Command
            </h2>
          </div>
          {queueStatus.length > 0 ? (
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Command</th>
                  <th>Status</th>
                  <th className="text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {queueStatus.map((q, i) => (
                  <tr key={`${q.queue}-${q.status}-${i}`}>
                    <td className="text-gray-700 dark:text-gray-300 font-medium">{q.queue}</td>
                    <td>
                      <JobStatusBadge status={q.status} />
                    </td>
                    <td className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatNumber(q.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-xs text-gray-400 text-center">No queue data</div>
          )}
        </div>
      </div>

      {/* Recent Crawl Runs */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Recent Crawl Runs
          </h2>
        </div>
        {crawlRuns.length > 0 ? (
          <table className="admin-table w-full text-xs">
            <thead>
              <tr className="text-left">
                <th>ID</th>
                <th>Started</th>
                <th className="text-center">Status</th>
                <th className="text-right">Targets</th>
                <th className="text-right">Succeeded</th>
                <th className="text-right">Fees</th>
                <th className="text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {crawlRuns.map((run) => (
                <tr key={run.id}>
                  <td className="text-gray-500 tabular-nums">{run.id}</td>
                  <td className="text-gray-700 dark:text-gray-300 tabular-nums">{run.started_at}</td>
                  <td className="text-center">
                    <CrawlStatusDot status={run.status} />
                  </td>
                  <td className="text-right tabular-nums text-gray-500">{run.targets_crawled}</td>
                  <td className="text-right tabular-nums text-gray-500">{run.targets_succeeded}</td>
                  <td className="text-right tabular-nums text-gray-600 font-medium">{run.fees_extracted}</td>
                  <td className="text-right tabular-nums text-gray-600 font-medium">{run.success_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">No crawl runs</div>
        )}
      </div>

      {/* Recent Ops Jobs */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Recent Ops Jobs
          </h2>
        </div>
        {jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>ID</th>
                  <th>Command</th>
                  <th className="text-center">Status</th>
                  <th>Created</th>
                  <th>Triggered By</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="text-gray-500 tabular-nums">{job.id}</td>
                    <td className="text-gray-700 dark:text-gray-300 font-medium">{job.command}</td>
                    <td className="text-center">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="text-gray-500 tabular-nums">{job.created_at}</td>
                    <td className="text-gray-500">{job.triggered_by ?? "-"}</td>
                    <td className="text-gray-400 max-w-[200px] truncate">
                      {job.error_summary ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">No recent jobs</div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function PipelineStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="admin-card p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CrawlStatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500"
      : status === "running"
        ? "bg-blue-500"
        : status === "failed"
          ? "bg-red-500"
          : "bg-gray-400";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] text-gray-500">{status}</span>
    </span>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  const cls = config[status] ?? config.queued;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {status}
    </span>
  );
}

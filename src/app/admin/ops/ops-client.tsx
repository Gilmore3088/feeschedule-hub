"use client";

import { useState, useEffect, useCallback } from "react";
import { triggerJob, cancelOpsJob } from "./actions";
import type { OpsJob, OpsJobSummary } from "@/lib/crawler-db/ops";
import type { CrawlStats } from "@/lib/crawler-db/types";
import { timeAgo } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
};

const COMMAND_DESCRIPTIONS: Record<string, string> = {
  crawl: "Download and extract fees from institution URLs",
  discover: "Find fee schedule URLs on institution websites",
  validate: "Re-validate existing extracted fees",
  categorize: "Batch-categorize fees using name aliases",
  analyze: "Compute peer comparisons and fee analysis",
  enrich: "Backfill tiers, districts, fix NCUA units",
  "outlier-detect": "Detect statistical outliers in fee amounts",
  "run-pipeline": "Full pipeline: discover, crawl, categorize",
  stats: "Show database statistics",
  "ingest-call-reports": "Ingest Call Report service charge revenue",
  "ingest-fdic": "Ingest FDIC financial data",
  "ingest-ncua": "Ingest NCUA 5300 financial data",
  "ingest-cfpb": "Ingest CFPB complaint data",
  "ingest-beige-book": "Ingest Federal Reserve Beige Book reports",
  "ingest-fed-content": "Ingest Fed speeches and research from RSS",
  "ingest-fred": "Ingest economic indicators from FRED API",
  seed: "Seed institution directory from FDIC/NCUA",
  "backfill-ncua-urls": "Backfill website URLs for NCUA credit unions",
};

interface OpsClientProps {
  summary: OpsJobSummary;
  activeJobs: OpsJob[];
  recentJobs: OpsJob[];
  crawlStats: CrawlStats;
  commands: string[];
  username: string;
}

export function OpsClient({
  summary: initialSummary,
  activeJobs: initialActive,
  recentJobs: initialRecent,
  crawlStats,
  commands,
}: OpsClientProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [activeJobs, setActiveJobs] = useState(initialActive);
  const [recentJobs, setRecentJobs] = useState(initialRecent);
  const [selectedCommand, setSelectedCommand] = useState(commands[0] || "");
  const [limit, setLimit] = useState("10");
  const [charterType, setCharterType] = useState<"" | "bank" | "credit_union">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/admin/ops/api");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setActiveJobs(data.activeJobs);
        setRecentJobs(data.recentJobs);
      }
    } catch {
      // Silently fail on poll errors
    }
  }, []);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [activeJobs.length, refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const params: Record<string, unknown> = {};
    const parsedLimit = parseInt(limit, 10);
    if (parsedLimit > 0) params.limit = parsedLimit;
    if (charterType) params.charter_type = charterType;

    const result = await triggerJob(selectedCommand, params);

    if (result.success) {
      setMessage({ type: "success", text: `Job #${result.jobId} started` });
      await refresh();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to start job" });
    }
    setIsSubmitting(false);
  }

  async function handleCancel(jobId: number) {
    const result = await cancelOpsJob(jobId);
    if (result.success) {
      setMessage({ type: "success", text: `Job #${jobId} cancelled` });
      await refresh();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to cancel" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          ["Total", summary.total, "text-gray-900 dark:text-gray-100"],
          ["Running", summary.running, "text-blue-600 dark:text-blue-400"],
          ["Queued", summary.queued, "text-amber-600 dark:text-amber-400"],
          ["Completed", summary.completed, "text-emerald-600 dark:text-emerald-400"],
          ["Failed", summary.failed, "text-red-600 dark:text-red-400"],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="admin-card px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {label}
            </div>
            <div className={`text-lg font-bold tabular-nums ${color}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Trigger form */}
        <div className="admin-card p-4">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
            Trigger Job
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Command
              </label>
              <select
                value={selectedCommand}
                onChange={(e) => setSelectedCommand(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                           dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
              >
                {commands.map((cmd) => (
                  <option key={cmd} value={cmd}>
                    {cmd}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">
                {COMMAND_DESCRIPTIONS[selectedCommand] || ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Limit
                </label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  min="1"
                  max="500"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                             dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Charter Type
                </label>
                <select
                  value={charterType}
                  onChange={(e) => setCharterType(e.target.value as "" | "bank" | "credit_union")}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                             dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
                >
                  <option value="">All</option>
                  <option value="bank">Banks</option>
                  <option value="credit_union">Credit Unions</option>
                </select>
              </div>
            </div>

            {message && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white
                         hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
                         dark:bg-white/10 dark:hover:bg-white/15"
            >
              {isSubmitting ? "Starting..." : "Run Job"}
            </button>
          </form>
        </div>

        {/* Active jobs */}
        <div className="admin-card p-4">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
            Active Jobs
            {activeJobs.length > 0 && (
              <span className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </h2>
          {activeJobs.length === 0 ? (
            <p className="text-sm text-gray-400">No active jobs</p>
          ) : (
            <div className="space-y-2">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2
                             dark:border-white/[0.08]"
                >
                  <StatusBadge status={job.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {job.command}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      #{job.id} by {job.triggered_by}
                      {job.started_at && ` - ${timeAgo(job.started_at)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancel(job.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t dark:border-white/[0.08]">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              System
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Institutions:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.total_institutions.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Fee URLs:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.with_fee_url.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Fees:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.total_fees.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Crawl Runs:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.crawl_runs.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent jobs table */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Recent Jobs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Command</th>
                <th className="px-4 py-2.5">Triggered By</th>
                <th className="px-4 py-2.5">Started</th>
                <th className="px-4 py-2.5">Duration</th>
                <th className="px-4 py-2.5 text-right">Exit</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No jobs yet. Trigger one above.
                  </td>
                </tr>
              ) : (
                recentJobs.map((job) => (
                  <>
                    <tr
                      key={job.id}
                      className="border-b hover:bg-gray-50/50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">
                        #{job.id}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                        {job.command}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {job.triggered_by}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                        {job.started_at ? timeAgo(job.started_at) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                        {formatDuration(job.started_at, job.completed_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {job.exit_code !== null ? (
                          <span
                            className={
                              job.exit_code === 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {job.exit_code}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${expandedJob === job.id ? "rotate-90" : ""}`}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 4l4 4-4 4" />
                        </svg>
                      </td>
                    </tr>
                    {expandedJob === job.id && (
                      <tr key={`${job.id}-detail`} className="border-b bg-gray-50/50 dark:bg-white/[0.02]">
                        <td colSpan={8} className="px-4 py-3">
                          <JobDetail job={job} onCancel={handleCancel} />
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        STATUS_COLORS[status] || "bg-gray-100 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

function JobDetail({ job, onCancel }: { job: OpsJob; onCancel: (id: number) => void }) {
  const params = (() => {
    try {
      return JSON.parse(job.params_json);
    } catch {
      return {};
    }
  })();

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <span className="text-gray-400">PID:</span>{" "}
          <span className="font-mono text-gray-600 dark:text-gray-300">{job.pid ?? "-"}</span>
        </div>
        <div>
          <span className="text-gray-400">Target ID:</span>{" "}
          <span className="tabular-nums text-gray-600 dark:text-gray-300">{job.target_id ?? "-"}</span>
        </div>
        <div>
          <span className="text-gray-400">Created:</span>{" "}
          <span className="text-gray-600 dark:text-gray-300">{job.created_at}</span>
        </div>
        <div>
          <span className="text-gray-400">Params:</span>{" "}
          <span className="font-mono text-gray-600 dark:text-gray-300">
            {params.args?.join(" ") || "none"}
          </span>
        </div>
      </div>

      {job.error_summary && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-2">
          <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">
            Error
          </div>
          <pre className="text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono text-[11px]">
            {job.error_summary}
          </pre>
        </div>
      )}

      {job.stdout_tail && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Log Tail
          </div>
          <pre className="rounded-md bg-gray-900 text-gray-300 px-3 py-2 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
            {job.stdout_tail}
          </pre>
        </div>
      )}

      {(job.status === "running" || job.status === "queued") && (
        <button
          onClick={() => onCancel(job.id)}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600
                     hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Cancel Job
        </button>
      )}
    </div>
  );
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  if (diffMs < 1000) return "<1s";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

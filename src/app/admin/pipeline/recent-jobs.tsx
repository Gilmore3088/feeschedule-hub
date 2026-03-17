import Link from "next/link";
import { getDb } from "@/lib/crawler-db/connection";
import { timeAgo } from "@/lib/format";

interface RecentJob {
  id: number;
  command: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  error_summary: string | null;
  result_summary: string | null;
  stdout_tail: string | null;
}

function getRecentPipelineJobs(): RecentJob[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT id, command, status, started_at, completed_at, exit_code, error_summary, result_summary, stdout_tail
         FROM ops_jobs
         ORDER BY created_at DESC LIMIT 10`
      )
      .all() as RecentJob[];
  } catch {
    return [];
  }
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatResultSummary(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    const parts: string[] = [];
    if (r.command === "crawl") {
      if (r.fees_extracted !== undefined) parts.push(`${r.fees_extracted} fees extracted`);
      if (r.succeeded !== undefined) parts.push(`${r.succeeded} succeeded`);
      if (r.failed > 0) parts.push(`${r.failed} failed`);
    } else if (r.command === "auto-review") {
      if (r.auto_approved !== undefined) parts.push(`${r.auto_approved} approved`);
      if (r.auto_rejected !== undefined) parts.push(`${r.auto_rejected} rejected`);
      if (r.kept_staged > 0) parts.push(`${r.kept_staged} still staged`);
    } else if (r.command === "outlier-detect") {
      if (r.decimal_errors_rejected > 0) parts.push(`${r.decimal_errors_rejected} decimal errors rejected`);
      if (r.statistical_outliers_flagged > 0) parts.push(`${r.statistical_outliers_flagged} outliers flagged`);
      if (r.skipped_manual > 0) parts.push(`${r.skipped_manual} manual skipped`);
    } else if (r.command === "categorize") {
      if (r.matched !== undefined) parts.push(`${r.matched} matched`);
      if (r.unmatched > 0) parts.push(`${r.unmatched} unmatched`);
    } else {
      if (r.processed !== undefined) parts.push(`${r.processed} processed`);
      if (r.succeeded !== undefined && r.succeeded !== r.processed) parts.push(`${r.succeeded} succeeded`);
    }
    return parts.length > 0 ? parts.join(" | ") : null;
  } catch {
    return null;
  }
}

function extractLastMeaningfulLine(stdout: string | null): string | null {
  if (!stdout) return null;
  const lines = stdout.split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("##RESULT_JSON##")) continue;
    if (line.includes("complete:") || line.includes("Fees found:") || line.includes("Auto-Review")) {
      return line;
    }
  }
  const last = lines.filter((l) => !l.startsWith("##")).pop();
  return last ? last.trim().slice(0, 120) : null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  running: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  queued: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500",
};

export function RecentJobs() {
  const jobs = getRecentPipelineJobs();

  if (jobs.length === 0) {
    return (
      <div className="admin-card p-6 text-center text-sm text-gray-400">
        No pipeline jobs yet. Use the Quick Actions above to run your first command.
      </div>
    );
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Recent Jobs
        </h3>
        <Link
          href="/admin/ops"
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          View all in Ops Center
        </Link>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
        {jobs.map((job) => {
          const summary = formatResultSummary(job.result_summary);
          const fallback = !summary ? extractLastMeaningfulLine(job.stdout_tail) : null;
          const dur = duration(job.started_at, job.completed_at);
          const statusCls = STATUS_STYLES[job.status] || STATUS_STYLES.queued;

          return (
            <Link
              key={job.id}
              href={`/admin/ops?job=${job.id}`}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors no-underline group"
            >
              {/* Status dot */}
              <span className={`mt-1 shrink-0 inline-block w-2 h-2 rounded-full ${
                job.status === "completed" ? "bg-emerald-500" :
                job.status === "failed" ? "bg-red-500" :
                job.status === "running" ? "bg-blue-500 animate-pulse" :
                "bg-gray-300"
              }`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {job.command}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${statusCls}`}>
                    {job.status}
                  </span>
                  {dur && (
                    <span className="text-[10px] text-gray-400 tabular-nums">{dur}</span>
                  )}
                  <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                    {timeAgo(job.completed_at || job.started_at || "")}
                  </span>
                </div>

                {/* Structured result */}
                {summary && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {summary}
                  </p>
                )}

                {/* Fallback to stdout parsing */}
                {!summary && fallback && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                    {fallback}
                  </p>
                )}

                {/* Error for failed jobs */}
                {!summary && !fallback && job.status === "failed" && job.error_summary && (
                  <p className="text-[11px] text-red-400 dark:text-red-500 mt-0.5 truncate">
                    {job.error_summary.split("\n")[0]}
                  </p>
                )}
              </div>

              {/* Chevron */}
              <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-1 group-hover:text-gray-500 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import { getDb } from "@/lib/crawler-db/connection";

interface RecentJob {
  id: number;
  command: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  error_summary: string | null;
  result_summary: string | null;
}

function getRecentPipelineJobs(): RecentJob[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT id, command, status, started_at, completed_at, exit_code, error_summary, result_summary
         FROM ops_jobs
         WHERE command IN ('run-pipeline', 'crawl', 'discover', 'categorize', 'validate', 'enrich', 'refresh-data',
                           'ingest-fred', 'ingest-bls', 'ingest-nyfed', 'ingest-ofr', 'ingest-cfpb',
                           'ingest-fdic', 'ingest-ncua', 'ingest-sod', 'ingest-census-acs', 'ingest-census-tracts')
         ORDER BY created_at DESC LIMIT 10`
      )
      .all() as RecentJob[];
  } catch {
    return [];
  }
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] p-6 text-center text-sm text-gray-400">
        No pipeline jobs have been run from the ops panel yet. Jobs triggered via GitHub Actions SSH don't appear here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Recent Pipeline Jobs
        </h3>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.04]">
            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Command</th>
            <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">When</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-gray-50 dark:border-white/[0.03] last:border-0">
              <td className="px-4 py-2 font-medium text-gray-700 dark:text-gray-300 font-mono text-[11px]">
                {job.command}
              </td>
              <td className="px-4 py-2 text-center">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${STATUS_STYLES[job.status] || STATUS_STYLES.queued}`}>
                  {job.status}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                {duration(job.started_at, job.completed_at)}
              </td>
              <td className="px-4 py-2 text-right text-gray-400">
                {timeAgo(job.started_at || job.completed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

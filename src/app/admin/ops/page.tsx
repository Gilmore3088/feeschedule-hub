export const dynamic = "force-dynamic";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getOpsJobs } from "@/lib/admin-queries";
import type { OpsJobRow } from "@/lib/admin-queries";

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-600",
  running: "bg-blue-50 text-blue-600",
  queued: "bg-amber-50 text-amber-600",
  failed: "bg-red-50 text-red-600",
  cancelled: "bg-gray-100 text-gray-500",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] || "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "-";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export default async function OpsPage() {
  await requireAuth("view");

  let jobs: OpsJobRow[] = [];
  try {
    jobs = await getOpsJobs(50);
  } catch {
    jobs = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Operations" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Operations
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Recent pipeline jobs and their outcomes
        </p>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Command
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Result
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Triggered By
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">
                    {job.id}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-200">
                    {job.command}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums text-xs">
                    {job.started_at || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums text-xs">
                    {formatDuration(job.duration_sec)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[300px] truncate" title={job.result_summary || job.error_summary || ""}>
                    {job.status === "failed"
                      ? <span className="text-red-500">{job.error_summary || "Failed"}</span>
                      : (job.result_summary || "-")}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {job.triggered_by || "-"}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

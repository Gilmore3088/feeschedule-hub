import { getSql } from "@/lib/crawler-db/connection";
import { timeAgo } from "@/lib/format";
import type { ReportJob, ReportType } from "@/lib/report-engine/types";
import { ReportControls } from "../report-controls";
import { publishReport, retryReport, cancelReport, cancelAllPending } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hamilton — Reports — Bank Fee Index Admin" };

// T-16-12: validate filter params against explicit allowlists
const VALID_STATUSES = new Set(["pending", "assembling", "rendering", "complete", "failed"]);
const VALID_TYPES = new Set<string>(["national_index", "state_index", "peer_brief", "monthly_pulse"]);

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  national_index: "National Index",
  state_index: "State Index",
  peer_brief: "Peer Brief",
  monthly_pulse: "Monthly Pulse",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  assembling: "bg-blue-50 text-blue-600",
  rendering: "bg-blue-50 text-blue-600",
  complete: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};

function getReportTitle(job: ReportJob): string {
  const typeLabel = REPORT_TYPE_LABELS[job.report_type] ?? job.report_type;
  if (job.report_type === "state_index" && job.params?.state_code) {
    return `${typeLabel} — ${job.params.state_code}`;
  }
  const year = new Date(job.created_at).getFullYear();
  const quarter = Math.ceil((new Date(job.created_at).getMonth() + 1) / 3);
  return `${typeLabel} Q${quarter} ${year}`;
}

export default async function HamiltonReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const statusFilter = params.status && VALID_STATUSES.has(params.status) ? params.status : null;
  const typeFilter = params.type && VALID_TYPES.has(params.type) ? params.type : null;

  const sql = getSql();

  // Fetch jobs with optional filters
  const jobs = await sql<ReportJob[]>`
    SELECT id, report_type, status, params, artifact_key, error, created_at, completed_at, user_id, data_manifest
    FROM report_jobs
    ${statusFilter ? sql`WHERE status = ${statusFilter}` : sql``}
    ${typeFilter && !statusFilter ? sql`WHERE report_type = ${typeFilter}` : typeFilter ? sql`AND report_type = ${typeFilter}` : sql``}
    ORDER BY created_at DESC
    LIMIT 100
  `.catch(() => [] as ReportJob[]);

  // Fetch published_reports to mark which jobs are already published
  const publishedRows = await sql<Array<{ job_id: string }>>`
    SELECT job_id FROM published_reports
  `.catch(() => [] as Array<{ job_id: string }>);

  const publishedJobIds = publishedRows.map((r) => r.job_id);
  const publishedSet = new Set(publishedJobIds);

  return (
    <div className="space-y-6">
      {/* Generation controls — client component */}
      <ReportControls publishedJobIds={publishedJobIds} />

      {/* Jobs table */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.05] flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 shrink-0">
            Report Jobs
          </h2>

          {/* Filter form */}
          <form method="GET" className="flex items-center gap-2 ml-auto">
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className="text-[11px] border border-gray-200 dark:border-white/[0.08] rounded px-2 py-1 bg-white dark:bg-white/[0.04] text-gray-700 dark:text-gray-300"
            >
              <option value="">All statuses</option>
              {Array.from(VALID_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <select
              name="type"
              defaultValue={typeFilter ?? ""}
              className="text-[11px] border border-gray-200 dark:border-white/[0.08] rounded px-2 py-1 bg-white dark:bg-white/[0.04] text-gray-700 dark:text-gray-300"
            >
              <option value="">All types</option>
              {Array.from(VALID_TYPES).map((t) => (
                <option key={t} value={t}>
                  {REPORT_TYPE_LABELS[t as ReportType]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="text-[11px] px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07] text-gray-700 dark:text-gray-300 font-medium transition-colors"
            >
              Filter
            </button>
            {(statusFilter || typeFilter) && (
              <a
                href="/admin/hamilton/reports"
                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Clear
              </a>
            )}
          </form>
          <form
            action={async () => {
              "use server";
              await cancelAllPending();
            }}
          >
            <button
              type="submit"
              className="text-[11px] px-2.5 py-1 rounded border border-red-200 bg-white hover:bg-red-50 dark:border-red-800 dark:bg-white/[0.04] dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-medium transition-colors"
            >
              Cancel All Pending
            </button>
          </form>
        </div>

        {jobs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            No report jobs yet. Use the controls above to generate a report.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-white/[0.02]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Error
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {jobs.map((job) => {
                  const title = getReportTitle(job);
                  const isPublished = publishedSet.has(job.id);
                  return (
                    <tr key={job.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-200 text-[12px] font-medium">
                        {title}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASSES[job.status] ?? "bg-gray-50 text-gray-500"}`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-500 dark:text-gray-400">
                        {timeAgo(job.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-500 dark:text-gray-400">
                        {job.completed_at ? timeAgo(job.completed_at) : "—"}
                      </td>
                      <td className="px-4 py-2.5 max-w-[200px]">
                        {job.error && (
                          <span
                            className="text-red-500 text-[11px] line-clamp-2"
                            title={job.error}
                          >
                            {job.error}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {job.status === "complete" && (
                            <a
                              href={`/api/reports/${job.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-[12px] font-medium transition-colors"
                            >
                              Preview PDF
                            </a>
                          )}

                          {job.status === "complete" && !isPublished && (
                            <form
                              action={async () => {
                                "use server";
                                await publishReport(job.id, title, job.report_type, true);
                              }}
                            >
                              <button
                                type="submit"
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                              >
                                Publish
                              </button>
                            </form>
                          )}

                          {job.status === "complete" && isPublished && (
                            <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                              Published
                            </span>
                          )}

                          {["pending", "assembling", "rendering"].includes(job.status) && (
                            <form
                              action={async () => {
                                "use server";
                                await cancelReport(job.id);
                              }}
                            >
                              <button
                                type="submit"
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </form>
                          )}

                          {job.status === "failed" && (
                            <form
                              action={async () => {
                                "use server";
                                await retryReport(job.id);
                              }}
                            >
                              <button
                                type="submit"
                                className="px-2.5 py-1 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors ml-2"
                              >
                                Retry
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getStateInstitutions,
  getStateSummary,
  getStateAgentRuns,
  getStateManualReview,
} from "@/lib/crawler-db/states";

// ---------------------------------------------------------------------------
// State name lookup
// ---------------------------------------------------------------------------

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  PR: "Puerto Rico", GU: "Guam", VI: "Virgin Islands", AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 40): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function rowTint(hasFeeUrl: boolean, feeCount: number): string {
  if (feeCount > 0) return "bg-emerald-50/40 dark:bg-emerald-900/10";
  if (hasFeeUrl) return "";
  return "bg-red-50/40 dark:bg-red-900/10";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StateDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireAuth("view");
  const { code } = await params;
  const stateCode = code.toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? stateCode;

  const [summary, institutions, agentRuns, manualReview] = await Promise.all([
    getStateSummary(stateCode),
    getStateInstitutions(stateCode),
    getStateAgentRuns(stateCode),
    getStateManualReview(stateCode),
  ]);

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "States" },
            { label: stateCode },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {stateName} ({stateCode})
        </h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          State coverage detail and institution breakdown
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8">
        <StatCard label="Total Institutions" value={formatNumber(summary.total)} />
        <StatCard label="With Fee URL" value={formatNumber(summary.withUrl)} />
        <StatCard label="With Extracted Fees" value={formatNumber(summary.withFees)} />
        <StatCard label="Coverage" value={`${summary.coveragePct}%`} highlight />
      </div>

      {/* Institution Table */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Institutions ({institutions.length})
          </h2>
        </div>
        {institutions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Name</th>
                  <th>City</th>
                  <th>Charter</th>
                  <th>Asset Tier</th>
                  <th>Fee URL</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">Last Crawl</th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => (
                  <tr
                    key={inst.id}
                    className={`hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors ${rowTint(!!inst.fee_schedule_url, inst.fee_count)}`}
                  >
                    <td>
                      <Link
                        href={`/admin/institutions?q=${encodeURIComponent(inst.institution_name)}`}
                        className="text-gray-900 dark:text-gray-100 hover:text-blue-600 transition-colors font-medium"
                      >
                        {inst.institution_name}
                      </Link>
                    </td>
                    <td className="text-gray-500">{inst.city ?? "-"}</td>
                    <td className="text-gray-500">{inst.charter_type ?? "-"}</td>
                    <td className="text-gray-500">{inst.asset_size_tier ?? "-"}</td>
                    <td>
                      {inst.fee_schedule_url ? (
                        <a
                          href={inst.fee_schedule_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          title={inst.fee_schedule_url}
                        >
                          {truncateUrl(inst.fee_schedule_url)}
                        </a>
                      ) : (
                        <span className="text-gray-300">none</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {inst.fee_count}
                    </td>
                    <td className="text-right tabular-nums text-gray-400">
                      {inst.last_crawled}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No institutions found in {stateCode}
          </div>
        )}
      </div>

      {/* Agent Run History */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Agent Run History
          </h2>
        </div>
        {agentRuns.length > 0 ? (
          <table className="admin-table w-full text-xs">
            <thead>
              <tr className="text-left">
                <th>Date</th>
                <th className="text-center">Status</th>
                <th className="text-right">Discovered</th>
                <th className="text-right">Classified</th>
                <th className="text-right">Extracted</th>
                <th className="text-right">Validated</th>
                <th className="text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {agentRuns.map((run) => (
                <tr
                  key={run.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <td className="text-gray-700 dark:text-gray-300 tabular-nums">
                    {run.started_at}
                  </td>
                  <td className="text-center">
                    <AgentStatusBadge status={run.status} />
                  </td>
                  <td className="text-right tabular-nums text-gray-500">
                    {run.discovered}
                  </td>
                  <td className="text-right tabular-nums text-gray-500">
                    {run.classified}
                  </td>
                  <td className="text-right tabular-nums text-gray-500">
                    {run.extracted}
                  </td>
                  <td className="text-right tabular-nums text-gray-500">
                    {run.validated}
                  </td>
                  <td className="text-right tabular-nums text-gray-500">
                    {run.failed > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {run.failed}
                      </span>
                    ) : (
                      run.failed
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No agent runs yet -- use the Scout Agent tab to run
          </div>
        )}
      </div>

      {/* Manual Review */}
      {manualReview.length > 0 && (
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Needs Manual Review ({manualReview.length} institutions)
            </h2>
          </div>
          <table className="admin-table w-full text-xs">
            <thead>
              <tr className="text-left">
                <th>Name</th>
                <th>Website</th>
                <th>Failure Reason</th>
              </tr>
            </thead>
            <tbody>
              {manualReview.map((inst) => (
                <tr
                  key={inst.id}
                  className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <td className="text-gray-900 dark:text-gray-100 font-medium">
                    {inst.institution_name}
                  </td>
                  <td>
                    {inst.website_url ? (
                      <a
                        href={inst.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {truncateUrl(inst.website_url)}
                      </a>
                    ) : (
                      <span className="text-gray-300">none</span>
                    )}
                  </td>
                  <td className="text-gray-500 max-w-xs truncate">
                    {inst.latest_failure_reason ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`admin-card p-4 ${highlight ? "ring-1 ring-blue-200/60 dark:ring-blue-800/40" : ""}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </p>
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {status}
    </span>
  );
}

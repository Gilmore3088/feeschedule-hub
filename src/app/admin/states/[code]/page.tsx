export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getStateInstitutions,
  getStateSummary,
  getStateAgentRuns,
  getStateUrlResolutionQueue,
} from "@/lib/data-store/states";
import { getStateLaneHealth } from "@/lib/agents/state-lane-memory";
import { runStateLaneFormAction } from "./actions";
import { UrlResolutionRow } from "./url-resolution-row";
import { SortableInstitutionTable } from "./sortable-institution-table";

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

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const runStateLaneForState = runStateLaneFormAction.bind(null, stateCode);

  const [summary, institutions, agentRuns, urlResolutionQueue, laneHealth] = await Promise.all([
    getStateSummary(stateCode),
    getStateInstitutions(stateCode),
    getStateAgentRuns(stateCode),
    getStateUrlResolutionQueue(stateCode),
    getStateLaneHealth(stateCode),
  ]);

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/admin" },
              { label: "States", href: "/admin/states" },
              { label: stateCode },
            ]}
          />
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {stateName} ({stateCode})
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            State coverage, source memory, and lane health
          </p>
        </div>
        <form action={runStateLaneForState}>
          <button
            type="submit"
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
          >
            Run State Lane
          </button>
        </form>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-8">
        <StatCard label="Total Institutions" value={formatNumber(summary.total)} />
        <StatCard label="With Fee URL" value={formatNumber(summary.withUrl)} />
        <StatCard label="With Published Fees" value={formatNumber(summary.withFees)} />
        <StatCard label="Coverage" value={`${summary.coveragePct}%`} highlight />
      </div>

      {/* State Lane Health */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Atlas State Lane
          </h2>
          {laneHealth?.lastAgentRunId && (
            <Link
              href={`/admin/states/${stateCode}/runs/${laneHealth.lastAgentRunId}`}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Run #{laneHealth.lastAgentRunId}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <StatCard label="Missing URLs" value={formatNumber(laneHealth?.backlogMissingUrls ?? 0)} />
          <StatCard label="Stale Sources" value={formatNumber(laneHealth?.backlogStaleSources ?? 0)} />
          <StatCard label="OCR Backlog" value={formatNumber(laneHealth?.backlogOcr ?? 0)} />
          <StatCard label="Manual Review" value={formatNumber(laneHealth?.backlogManualReview ?? 0)} />
          <StatCard label="Failures" value={formatNumber(laneHealth?.failures ?? 0)} />
          <StatCard label="Corrections" value={formatNumber(laneHealth?.corrections ?? 0)} />
          <StatCard label="Last Success" value={formatDateTime(laneHealth?.lastSuccessAt ?? null)} />
          <StatCard label="Next Run" value={formatDateTime(laneHealth?.nextRunAfter ?? null)} />
        </div>
        {laneHealth && (
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            <LaneMiniSummary
              title="Source Kinds"
              items={[
                ["PDF", laneHealth.sourceKinds.pdf],
                ["HTML", laneHealth.sourceKinds.html],
                ["Scanned", laneHealth.sourceKinds.scannedPdf],
                ["Unknown", laneHealth.sourceKinds.unknown],
                ["Offline", laneHealth.sourceKinds.offline],
              ]}
            />
            <LaneMiniSummary
              title="Read Strategies"
              items={[
                ["PDF text", laneHealth.readStrategies.pdfText],
                ["HTML DOM", laneHealth.readStrategies.htmlDom],
                ["Browser", laneHealth.readStrategies.browserRender],
                ["OCR", laneHealth.readStrategies.ocr],
                ["Manual", laneHealth.readStrategies.manualReview],
              ]}
            />
          </div>
        )}
      </div>

      {/* Institution Table */}
      <SortableInstitutionTable
        institutions={institutions}
      />

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
                    <Link
                      href={`/admin/states/${stateCode}/runs/${run.id}`}
                      className="hover:text-blue-600 transition-colors"
                    >
                      {run.started_at}
                    </Link>
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
            No agent runs yet. Use Run State Lane to create the first Atlas-led state run.
          </div>
        )}
      </div>

      {/* URL Resolution */}
      {urlResolutionQueue.length > 0 && (
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Magellan URL Resolution ({urlResolutionQueue.length} institutions)
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
              {urlResolutionQueue.map((inst) => (
                <UrlResolutionRow
                  key={inst.id}
                  institutionId={inst.id}
                  institutionName={inst.institution_name}
                  websiteUrl={inst.website_url}
                  failureReason={inst.latest_failure_reason}
                />
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

function LaneMiniSummary({
  title,
  items,
}: {
  title: string;
  items: Array<[string, number]>;
}) {
  return (
    <div className="admin-card p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      <div className="grid grid-cols-5 gap-2 text-[11px]">
        {items.map(([label, value]) => (
          <div key={label}>
            <p className="text-gray-400">{label}</p>
            <p className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {formatNumber(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

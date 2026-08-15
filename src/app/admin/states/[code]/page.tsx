export const dynamic = "force-dynamic";

import Link from "next/link";
import { hasPermission, requireAuth } from "@/lib/auth";
import { getAutomationControl } from "@/lib/automation-control";
import { getExecutionBackendStatus } from "@/lib/execution-backend";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getStateInstitutions,
  getStateSummary,
  getStateAgentRuns,
  getStateUrlResolutionQueue,
} from "@/lib/data-store/states";
import {
  getStateLaneHealth,
  getStatePublicDiscoveryFindings,
  getStateSourceMemoryProfiles,
  type StateReadStrategy,
  type StatePublicDiscoveryFinding,
  type StateSourceMemoryProfile,
  type StateSourceKind,
} from "@/lib/agents/state-lane-memory";
import { correctStateSourceMemory, decidePublicDiscoveryFinding, runStateLaneFormAction } from "./actions";
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

function formatIssueCode(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatToken(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StateDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requireAuth("view");
  const { code } = await params;
  const stateCode = code.toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? stateCode;
  const runStateLaneForState = runStateLaneFormAction.bind(null, stateCode);
  const canReviewPublicFindings = hasPermission(user, "approve");
  const canCorrectSourceMemory = hasPermission(user, "approve");

  const [summary, institutions, agentRuns, urlResolutionQueue, laneHealth, sourceMemory, publicFindings, automation, execution] = await Promise.all([
    getStateSummary(stateCode),
    getStateInstitutions(stateCode),
    getStateAgentRuns(stateCode),
    getStateUrlResolutionQueue(stateCode),
    getStateLaneHealth(stateCode),
    getStateSourceMemoryProfiles(stateCode),
    getStatePublicDiscoveryFindings(stateCode),
    getAutomationControl(),
    Promise.resolve(getExecutionBackendStatus()),
  ]);
  const stateLaneBlockedReason = !automation.enabled
    ? automation.reason ?? "Automation safety stop is active."
    : !execution.enabled
      ? execution.detail
      : null;

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
            disabled={Boolean(stateLaneBlockedReason)}
            title={stateLaneBlockedReason ?? "Schedule this state lane"}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
          >
            {stateLaneBlockedReason ? "State Lane Paused" : "Run State Lane"}
          </button>
          {stateLaneBlockedReason && (
            <p className="mt-1 max-w-xs text-right text-[10px] font-medium text-amber-700 dark:text-amber-300">
              {stateLaneBlockedReason}
            </p>
          )}
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <StatCard label="Missing URLs" value={formatNumber(laneHealth?.backlogMissingUrls ?? 0)} />
          <StatCard label="Stale Sources" value={formatNumber(laneHealth?.backlogStaleSources ?? 0)} />
          <StatCard label="OCR Backlog" value={formatNumber(laneHealth?.backlogOcr ?? 0)} />
          <StatCard label="Manual Review" value={formatNumber(laneHealth?.backlogManualReview ?? 0)} />
          <StatCard label="Failures" value={formatNumber(laneHealth?.failures ?? 0)} />
          <StatCard label="Corrections" value={formatNumber(laneHealth?.corrections ?? 0)} />
          <StatCard label="Public Findings" value={formatNumber(laneHealth?.publicFindings.unverified ?? 0)} />
          <StatCard label="Critical Pages" value={formatNumber(laneHealth?.publicFindings.critical ?? 0)} />
          <StatCard label="Last Success" value={formatDateTime(laneHealth?.lastSuccessAt ?? null)} />
          <StatCard label="Next Run" value={formatDateTime(laneHealth?.nextRunAfter ?? null)} />
        </div>
        {laneHealth && (
          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
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
            <LaneMiniSummary
              title="Public Discovery"
              items={[
                ["Open", laneHealth.publicFindings.unverified],
                ["Verified", laneHealth.publicFindings.verified],
                ["Critical", laneHealth.publicFindings.critical],
              ]}
            />
          </div>
        )}
      </div>

      {/* Source Memory */}
      <SourceMemoryTable
        stateCode={stateCode}
        rows={sourceMemory}
        totalProfiles={laneHealth?.profileCount ?? sourceMemory.length}
        canCorrect={canCorrectSourceMemory}
      />

      {/* Public Discovery Findings */}
      <PublicDiscoveryFindingsTable
        stateCode={stateCode}
        findings={publicFindings}
        totalOpen={laneHealth?.publicFindings.unverified ?? publicFindings.length}
        canReview={canReviewPublicFindings}
      />

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

function SourceMemoryTable({
  stateCode,
  rows,
  totalProfiles,
  canCorrect,
}: {
  stateCode: string;
  rows: StateSourceMemoryProfile[];
  totalProfiles: number;
  canCorrect: boolean;
}) {
  return (
    <div className="admin-card mb-8 overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">
            Source Memory
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Institution source profiles prioritized by corrections, read backlog, failures, and unknown sources
          </p>
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
          Showing {formatNumber(rows.length)} of {formatNumber(totalProfiles)}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-xs">
            <thead>
              <tr className="text-left">
                <th>Institution</th>
                <th>Source</th>
                <th>Kind</th>
                <th>Read</th>
                <th>Memory</th>
                <th>Last Activity</th>
                {canCorrect && <th>Correction</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.institutionId}>
                  <td className="min-w-[220px]">
                    <Link
                      href={`/admin/institution/${row.institutionId}`}
                      className="font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-300"
                    >
                      {row.institutionName}
                    </Link>
                    <span className="mt-1 block text-[11px] text-gray-400">
                      {row.city ?? "No city"} · #{row.institutionId}
                    </span>
                  </td>
                  <td className="min-w-[260px]">
                    {row.canonicalSourceUrl || row.feeScheduleUrl ? (
                      <a
                        href={row.canonicalSourceUrl ?? row.feeScheduleUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="block max-w-sm truncate font-mono text-[10px] font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300"
                      >
                        {row.canonicalSourceUrl ?? row.feeScheduleUrl}
                      </a>
                    ) : (
                      <span className="text-gray-400">No fee source</span>
                    )}
                    {row.websiteUrl && (
                      <a
                        href={row.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block max-w-sm truncate font-mono text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {row.websiteUrl}
                      </a>
                    )}
                  </td>
                  <td>
                    <SourceMemoryBadge value={formatToken(row.sourceKind)} tone={sourceKindTone(row.sourceKind)} />
                  </td>
                  <td>
                    <SourceMemoryBadge value={formatToken(row.readStrategy)} tone={readStrategyTone(row.readStrategy)} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {row.lockedByCorrection && <SourceMemoryBadge value="Locked" tone="blue" />}
                      {row.correctionCount > 0 && (
                        <SourceMemoryBadge value={`${formatNumber(row.correctionCount)} corrections`} tone="gray" />
                      )}
                      {row.consecutiveFailures > 0 && (
                        <SourceMemoryBadge value={`${formatNumber(row.consecutiveFailures)} failures`} tone="red" />
                      )}
                    </div>
                    {row.latestCorrectionType && (
                      <span className="mt-1 block text-[10px] text-gray-400">
                        Latest: {formatToken(row.latestCorrectionType)}
                      </span>
                    )}
                    {row.lastFailureReason && (
                      <span className="mt-1 block max-w-xs truncate text-[10px] text-red-600 dark:text-red-300">
                        {row.lastFailureReason}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums text-gray-500">
                    <span className="block">Success {formatDateTime(row.lastSuccessAt)}</span>
                    <span className="mt-1 block text-[10px] text-gray-400">
                      Updated {formatDateTime(row.updatedAt)}
                    </span>
                  </td>
                  {canCorrect && (
                    <td className="min-w-[340px]">
                      <SourceMemoryCorrectionForm stateCode={stateCode} row={row} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-5 text-xs text-gray-400">
          No source memory profiles are available for this state lane.
        </div>
      )}
    </div>
  );
}

const SOURCE_KIND_OPTIONS: Array<{ value: StateSourceKind; label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "html", label: "HTML" },
  { value: "scanned_pdf", label: "Scanned PDF" },
  { value: "unknown", label: "Unknown" },
  { value: "offline", label: "Offline" },
];

const READ_STRATEGY_OPTIONS: Array<{ value: "" | StateReadStrategy; label: string }> = [
  { value: "", label: "Infer" },
  { value: "pdf_text", label: "PDF text" },
  { value: "html_dom", label: "HTML DOM" },
  { value: "browser_render", label: "Browser render" },
  { value: "ocr", label: "OCR" },
  { value: "manual_review", label: "Manual review" },
];

function SourceMemoryCorrectionForm({
  stateCode,
  row,
}: {
  stateCode: string;
  row: StateSourceMemoryProfile;
}) {
  return (
    <form action={correctStateSourceMemory} className="grid gap-2">
      <input type="hidden" name="institution_id" value={row.institutionId} />
      <input type="hidden" name="state_code" value={stateCode} />
      <label className="sr-only" htmlFor={`source-url-${row.institutionId}`}>Canonical source URL</label>
      <input
        id={`source-url-${row.institutionId}`}
        name="canonical_source_url"
        type="url"
        defaultValue={row.canonicalSourceUrl ?? row.feeScheduleUrl ?? ""}
        placeholder="https://institution.example/fees.pdf"
        className="min-h-8 rounded border border-gray-200 bg-white px-2 font-mono text-[10px] text-gray-700 outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor={`source-kind-${row.institutionId}`}>Source kind</label>
        <select
          id={`source-kind-${row.institutionId}`}
          name="source_kind"
          defaultValue={row.sourceKind}
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        >
          {SOURCE_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`read-strategy-${row.institutionId}`}>Read strategy</label>
        <select
          id={`read-strategy-${row.institutionId}`}
          name="read_strategy"
          defaultValue={row.readStrategy ?? ""}
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        >
          {READ_STRATEGY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor={`correction-reason-${row.institutionId}`}>Correction reason</label>
        <input
          id={`correction-reason-${row.institutionId}`}
          name="reason"
          placeholder="Correction note"
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        />
        <button
          type="submit"
          className="min-h-8 rounded border border-blue-200 px-2 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/30"
        >
          Lock
        </button>
      </div>
    </form>
  );
}

type SourceMemoryTone = "gray" | "blue" | "green" | "amber" | "red";

function sourceKindTone(value: StateSourceMemoryProfile["sourceKind"]): SourceMemoryTone {
  if (value === "pdf" || value === "html") return "green";
  if (value === "scanned_pdf") return "amber";
  if (value === "offline") return "red";
  return "gray";
}

function readStrategyTone(value: StateSourceMemoryProfile["readStrategy"]): SourceMemoryTone {
  if (value === "pdf_text" || value === "html_dom") return "green";
  if (value === "browser_render") return "blue";
  if (value === "ocr" || value === "manual_review") return "amber";
  return "gray";
}

function SourceMemoryBadge({
  value,
  tone,
}: {
  value: string;
  tone: SourceMemoryTone;
}) {
  const cls = tone === "green"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
    : tone === "blue"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : tone === "red"
          ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";

  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${cls}`}>
      {value}
    </span>
  );
}

function PublicDiscoveryFindingsTable({
  stateCode,
  findings,
  totalOpen,
  canReview,
}: {
  stateCode: string;
  findings: StatePublicDiscoveryFinding[];
  totalOpen: number;
  canReview: boolean;
}) {
  return (
    <div className="admin-card mb-8 overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">
            Public Discovery Findings
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Open deterministic page findings for this Atlas lane
          </p>
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
          Showing {formatNumber(findings.length)} of {formatNumber(totalOpen)}
        </span>
      </div>

      {findings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-xs">
            <thead>
              <tr className="text-left">
                <th>Route</th>
                <th>Issue</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Cluster</th>
                <th>Observed</th>
                <th className="text-right">Run</th>
                {canReview && <th className="text-right">Decision</th>}
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td className="min-w-[280px]">
                    <a
                      href={finding.finalUrl ?? finding.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gray-900 transition-colors hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-300"
                    >
                      {finding.routeTemplate ?? "Public route"}
                    </a>
                    <span className="mt-1 block max-w-md truncate font-mono text-[10px] text-gray-400">
                      {finding.url}
                    </span>
                  </td>
                  <td>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {formatIssueCode(finding.issueCode)}
                    </span>
                    <span className="mt-1 block max-w-sm text-[11px] text-gray-500 dark:text-gray-400">
                      {finding.message}
                    </span>
                  </td>
                  <td>
                    <SeverityBadge severity={finding.severity} />
                  </td>
                  <td className="tabular-nums text-gray-600 dark:text-gray-300">
                    {finding.statusCode ?? "n/a"}
                    {finding.viewport && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                        {finding.viewport}
                      </span>
                    )}
                  </td>
                  <td>
                    {finding.systemicCandidate || finding.clusterSize > 1 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        {finding.clusterSize} in template
                      </span>
                    ) : (
                      <span className="text-gray-400">Single</span>
                    )}
                  </td>
                  <td className="tabular-nums text-gray-500">
                    {formatDateTime(finding.observedAt ?? finding.createdAt)}
                  </td>
                  <td className="text-right">
                    {finding.agentRunId ? (
                      <Link
                        href={`/admin/states/${stateCode}/runs/${finding.agentRunId}`}
                        className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        #{finding.agentRunId}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  {canReview && (
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <PublicFindingDecisionButton
                          findingId={finding.id}
                          stateCode={stateCode}
                          status="verified"
                          label="Confirm"
                        />
                        <PublicFindingDecisionButton
                          findingId={finding.id}
                          stateCode={stateCode}
                          status="dismissed"
                          label="Dismiss"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-5 text-xs text-gray-400">
          No open public discovery findings for this state lane.
        </div>
      )}
    </div>
  );
}

function PublicFindingDecisionButton({
  findingId,
  stateCode,
  status,
  label,
}: {
  findingId: number;
  stateCode: string;
  status: "verified" | "dismissed";
  label: string;
}) {
  const className = status === "verified"
    ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]";

  return (
    <form action={decidePublicDiscoveryFinding}>
      <input type="hidden" name="finding_id" value={findingId} />
      <input type="hidden" name="state_code" value={stateCode} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${className}`}
      >
        {label}
      </button>
    </form>
  );
}

function SeverityBadge({ severity }: { severity: StatePublicDiscoveryFinding["severity"] }) {
  const cls = severity === "critical"
    ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
    : severity === "warning"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
      : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";

  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${cls}`}>
      {severity}
    </span>
  );
}

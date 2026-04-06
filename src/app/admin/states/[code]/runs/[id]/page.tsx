export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getAgentRunDetail } from "@/lib/crawler-db/states";
import type { AgentRunResult } from "@/lib/crawler-db/states";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstitutionRow {
  crawl_target_id: number;
  institution_name: string;
  discover: AgentRunResult | null;
  classify: AgentRunResult | null;
  extract: AgentRunResult | null;
  validate: AgentRunResult | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGES = ["discover", "classify", "extract", "validate"] as const;

function buildInstitutionRows(results: AgentRunResult[]): InstitutionRow[] {
  const map = new Map<number, InstitutionRow>();
  for (const r of results) {
    if (!map.has(r.crawl_target_id)) {
      map.set(r.crawl_target_id, {
        crawl_target_id: r.crawl_target_id,
        institution_name: r.institution_name,
        discover: null,
        classify: null,
        extract: null,
        validate: null,
      });
    }
    const row = map.get(r.crawl_target_id)!;
    const stage = r.stage as (typeof STAGES)[number];
    if (STAGES.includes(stage)) {
      row[stage] = r;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.institution_name.localeCompare(b.institution_name),
  );
}

function failuresByStage(results: AgentRunResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.status === "failed") {
      counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    }
  }
  return counts;
}

function commonFailureReasons(
  results: AgentRunResult[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.status !== "failed") continue;
    const reason =
      (r.detail?.reason as string) ??
      (r.detail?.error as string) ??
      "Unknown";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function duration(start: string, end: string): string {
  if (start === "-" || end === "-") return "-";
  const ms =
    new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "-";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AgentRunDetailPage({
  params,
}: {
  params: Promise<{ code: string; id: string }>;
}) {
  await requireAuth("view");
  const { code, id } = await params;
  const stateCode = code.toUpperCase();
  const runId = Number(id);

  if (isNaN(runId)) notFound();

  const { run, results } = await getAgentRunDetail(runId);
  if (!run || run.state_code !== stateCode) notFound();

  const rows = buildInstitutionRows(results);
  const stageFailures = failuresByStage(results);
  const reasons = commonFailureReasons(results);

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "States", href: "/admin/states" },
            { label: stateCode, href: `/admin/states/${stateCode}` },
            { label: `Run #${run.id}` },
          ]}
        />
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Agent Run #{run.id}
          </h1>
          <StatusBadge status={run.status} />
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {run.started_at}
          {run.completed_at !== "-" && (
            <span>
              {" "}&mdash; {run.completed_at} ({duration(run.started_at, run.completed_at)})
            </span>
          )}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-8">
        <StatCard label="Discovered" value={run.discovered} />
        <StatCard label="Classified" value={run.classified} />
        <StatCard label="Extracted" value={run.extracted} />
        <StatCard label="Validated" value={run.validated} />
        <StatCard
          label="Failed"
          value={run.failed}
          alert={run.failed > 0}
        />
      </div>

      {/* Per-institution Results */}
      <div className="admin-card overflow-hidden mb-8">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
            Per-Institution Results ({rows.length})
          </h2>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th>Institution</th>
                  <th className="text-center">Discover</th>
                  <th className="text-center">Classify</th>
                  <th className="text-center">Extract</th>
                  <th className="text-center">Validate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.crawl_target_id}
                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <td className="text-gray-900 dark:text-gray-100 font-medium">
                      <Link
                        href={`/admin/institution/${row.crawl_target_id}`}
                        className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {row.institution_name}
                      </Link>
                    </td>
                    <td className="text-center">
                      <StageCell result={row.discover} stage="discover" />
                    </td>
                    <td className="text-center">
                      <StageCell result={row.classify} stage="classify" />
                    </td>
                    <td className="text-center">
                      <StageCell result={row.extract} stage="extract" />
                    </td>
                    <td className="text-center">
                      <StageCell result={row.validate} stage="validate" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-xs text-gray-400 text-center">
            No results recorded for this run
          </div>
        )}
      </div>

      {/* Summaries */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Failures by Stage */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Failures by Stage
            </h2>
          </div>
          {Object.keys(stageFailures).length > 0 ? (
            <div className="p-4 space-y-2">
              {STAGES.map((stage) =>
                stageFailures[stage] ? (
                  <div key={stage} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 dark:text-gray-300 capitalize">
                      {stage}
                    </span>
                    <span className="text-red-600 dark:text-red-400 font-bold tabular-nums">
                      {stageFailures[stage]}
                    </span>
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <div className="p-4 text-xs text-gray-400 text-center">
              No failures
            </div>
          )}
        </div>

        {/* Common Failure Reasons */}
        <div className="admin-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04]">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">
              Common Failure Reasons
            </h2>
          </div>
          {reasons.length > 0 ? (
            <div className="p-4 space-y-2">
              {reasons.map((entry, i) => (
                <div key={i} className="flex items-start justify-between gap-4 text-xs">
                  <span
                    className="text-gray-600 dark:text-gray-400 break-words min-w-0"
                    title={entry.reason}
                  >
                    {truncate(entry.reason)}
                  </span>
                  <span className="text-red-600 dark:text-red-400 font-bold tabular-nums shrink-0">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-xs text-gray-400 text-center">
              No failures
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="admin-card p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`text-xl font-bold tabular-nums ${
          alert
            ? "text-red-600 dark:text-red-400"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    running:
      "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    failed:
      "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const cls =
    styles[status] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {status}
    </span>
  );
}

function StageCell({
  result,
  stage,
}: {
  result: AgentRunResult | null;
  stage: string;
}) {
  if (!result) {
    return <span className="text-gray-300 dark:text-gray-600">--</span>;
  }

  const { status, detail } = result;

  if (status === "ok" || status === "success" || status === "completed") {
    let extra = "";
    if (stage === "extract" && detail?.fee_count != null) {
      extra = ` (${detail.fee_count})`;
    }
    if (stage === "validate" && detail?.data_quality != null) {
      extra = ` (${detail.data_quality})`;
    }
    return (
      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
        ok{extra}
      </span>
    );
  }

  if (status === "skipped") {
    return (
      <span className="text-gray-400 dark:text-gray-500">skipped</span>
    );
  }

  // Failed
  const reason =
    (detail?.reason as string) ??
    (detail?.error as string) ??
    "";
  return (
    <span
      className="text-red-600 dark:text-red-400 font-medium cursor-help"
      title={reason || "Failed"}
    >
      failed
      {reason && (
        <span className="block text-[10px] text-red-400 dark:text-red-500 font-normal max-w-[160px] truncate mx-auto">
          {truncate(reason, 40)}
        </span>
      )}
    </span>
  );
}

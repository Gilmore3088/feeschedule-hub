"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { startPipelineRun, rerunFailedSteps } from "./actions";
import type {
  PipelineRunRow,
  PipelineStepRow,
  PipelineState,
  RunStatus,
  StepStatus,
} from "@/lib/pipeline/types";

const ALL_STAGES = ["discover", "extract", "classify", "review", "publish"];
const POLL_ACTIVE_MS = 2500;
const POLL_IDLE_MS = 12000;

function isActive(runs: PipelineRunRow[]): boolean {
  return runs.some((r) => r.status === "running" || r.status === "queued");
}

function fmtDuration(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "—";
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function fmtTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PipelineLive({
  initialRuns,
  initialSteps,
}: {
  initialRuns: PipelineRunRow[];
  initialSteps: PipelineStepRow[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [steps, setSteps] = useState(initialSteps);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (): Promise<PipelineRunRow[] | null> => {
    try {
      const res = await fetch("/api/admin/pipeline/state", { cache: "no-store" });
      if (res.ok) {
        const data: PipelineState = await res.json();
        setRuns(data.runs);
        setSteps(data.latestSteps);
        return data.runs;
      }
    } catch {
      // transient — try again next tick
    }
    return null;
  }, []);

  // Adaptive polling: fast while a run is active, slow when idle.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const latest = await poll();
      if (cancelled) return;
      // Unknown (fetch failed) → keep checking at the active cadence.
      const delay = latest === null || isActive(latest) ? POLL_ACTIVE_MS : POLL_IDLE_MS;
      timer.current = setTimeout(tick, delay);
    }
    timer.current = setTimeout(tick, isActive(initialRuns) ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll, initialRuns]);

  function trigger(stages: string[], label: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await startPipelineRun(stages);
      setMessage(
        res.ok
          ? { text: `${label}: run #${res.runId} completed`, error: false }
          : { text: res.error ?? `${label} failed`, error: true },
      );
      await poll();
    });
  }

  function rerun(sourceRunId: number) {
    setMessage(null);
    startTransition(async () => {
      const res = await rerunFailedSteps(sourceRunId);
      setMessage(
        res.ok
          ? { text: `Re-ran failed steps: run #${res.runId}`, error: false }
          : { text: res.error ?? "Re-run failed", error: true },
      );
      await poll();
    });
  }

  const latestRun = runs[0];
  const latestHasFailed = steps.some((s) => s.status === "failed");
  const running = isActive(runs);

  return (
    <div className="admin-card overflow-hidden mb-8">
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em] flex items-center gap-2">
            Pipeline Control
            {running && (
              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /> live
              </span>
            )}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Trigger any stage and watch it live — backed by pipeline_runs / pipeline_steps
          </p>
        </div>
        <button
          type="button"
          onClick={() => trigger(ALL_STAGES, "Full pipeline")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          {pending && <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />}
          {pending ? "Running…" : "Run full pipeline (dry-run)"}
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Per-stage triggers */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
            Run a single stage:
          </span>
          {ALL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => trigger([stage], stage)}
              disabled={pending}
              className="rounded-md border border-gray-200 dark:border-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
            >
              {stage}
            </button>
          ))}
          {message && (
            <span className={`text-[11px] font-medium ${message.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {message.text}
            </span>
          )}
        </div>

        {/* Recent runs */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Runs</p>
          {runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="admin-table w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th>Run</th><th>Trigger</th><th>By</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Steps</th>
                    <th>Started</th>
                    <th className="text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="tabular-nums text-gray-500">#{run.id}</td>
                      <td className="text-gray-600 dark:text-gray-300">{run.trigger_source}</td>
                      <td className="text-gray-500">{run.triggered_by}</td>
                      <td className="text-center"><RunStatusBadge status={run.status} /></td>
                      <td className="text-right tabular-nums text-gray-500">{run.stages_done}/{run.stages_total}</td>
                      <td className="text-gray-500 tabular-nums">{fmtTime(run.started_at)}</td>
                      <td className="text-right tabular-nums text-gray-600">{fmtDuration(run.started_at, run.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/[0.08] p-6 text-center">
              <p className="text-xs text-gray-400">No runs yet. Trigger one above.</p>
            </div>
          )}
        </div>

        {/* Latest run — step detail */}
        {steps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Latest Run · Steps (run #{latestRun?.id})
              </p>
              {latestHasFailed && latestRun && (
                <button
                  type="button"
                  onClick={() => rerun(latestRun.id)}
                  disabled={pending}
                  className="rounded-md border border-red-200 dark:border-red-900/40 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Re-run failed steps
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="admin-table w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th>Stage</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th className="text-right">Duration</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step) => (
                    <tr key={step.id}>
                      <td className="font-medium text-gray-700 dark:text-gray-300">{step.stage}</td>
                      <td className="text-center"><StepStatusBadge status={step.status} /></td>
                      <td className="text-right tabular-nums text-gray-600">{step.rows_in ?? "—"}</td>
                      <td className="text-right tabular-nums text-gray-600">{step.rows_out ?? "—"}</td>
                      <td className="text-right tabular-nums text-gray-500">{fmtDuration(step.started_at, step.finished_at)}</td>
                      <td className="text-gray-400 max-w-[280px] truncate">
                        {step.error ? step.error : typeof step.notes_json?.message === "string" ? step.notes_json.message : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const config: Record<RunStatus, string> = {
    succeeded: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    canceled: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${config[status]}`}>{status}</span>;
}

function StepStatusBadge({ status }: { status: StepStatus }) {
  const config: Record<StepStatus, string> = {
    succeeded: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    skipped: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${config[status]}`}>{status}</span>;
}

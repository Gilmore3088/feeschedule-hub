"use client";

import { useCallback, useEffect, useState } from "react";
import { BatchRunner, type BatchSizeOption } from "@/components/agent-console/batch-runner";
import { CircuitBanner } from "@/components/agent-console/circuit-banner";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { formatAdminDateTime } from "@/lib/admin-time";
import { summarizeJobOutput } from "@/lib/job-output-summary";
import { StatusPanel } from "./status-panel";
import { fetchMagellanStatus, resetMagellanCircuit, runMagellanRepair } from "../actions";
import type { MagellanStatus } from "../types";

type WatchedJob = {
  id: number;
  command: string;
  agent: string;
  status: string;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  updatedAt: string | null;
  backendReceipt: string | null;
  error: string | null;
  resultSummary: string | null;
  stdoutTail: string | null;
};

type AtlasStatusSnapshot = {
  generatedAt: string;
  activeJobs: WatchedJob[];
  recentJobs: WatchedJob[];
};

type QueuedJob = {
  id: number;
  size: BatchSizeOption;
  chain: number;
  reused: boolean;
};

const ACTIVE_STATUSES = ["queued", "running", "cancel_requested"];

function dateTime(value: string | null): string {
  return formatAdminDateTime(value, { seconds: true });
}

function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function statusTone(status: string): string {
  if (status === "completed") return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30";
  if (status === "running") return "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30";
  if (status === "queued" || status === "cancel_requested") return "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30";
  if (status === "cancelled") return "text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-white/[0.08]";
  return "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30";
}

function jobMessage(job: WatchedJob): string {
  return job.error
    ?? summarizeJobOutput(job.stdoutTail)
    ?? job.resultSummary
    ?? (isActiveStatus(job.status) ? "Waiting for agent events." : "No terminal summary recorded.");
}

export function MagellanConsole({ initialStatus }: { initialStatus: MagellanStatus }) {
  const [status, setStatus] = useState<MagellanStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [queuedJob, setQueuedJob] = useState<QueuedJob | null>(null);
  const [watchedJob, setWatchedJob] = useState<WatchedJob | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await fetchMagellanStatus()); } catch {}
  }, []);

  const refreshJob = useCallback(async (jobId: number) => {
    try {
      const response = await fetch("/admin/atlas/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = (await response.json()) as AtlasStatusSnapshot;
      const job = [...snapshot.activeJobs, ...snapshot.recentJobs].find((item) => item.id === jobId);
      if (job) {
        setWatchedJob(job);
        setWatchError(null);
      }
    } catch (error) {
      setWatchError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const start = useCallback(async (size: BatchSizeOption, chain: number) => {
    setRunning(true);
    setQueuedJob(null);
    setWatchedJob(null);
    setWatchError(null);
    setError(null);
    try {
      const result = await runMagellanRepair(size, chain);
      if (!result.success) {
        setError(result.error ?? "Magellan repair could not be queued");
      } else if (typeof result.jobId === "number") {
        setQueuedJob({ id: result.jobId, size, chain, reused: Boolean(result.reused) });
        window.dispatchEvent(new CustomEvent("atlas:started", {
          detail: {
            jobId: result.jobId,
            runId: result.jobId,
            title: "Magellan fee URL rescue",
            label: "Magellan repair",
            agent: "magellan",
            reused: result.reused,
            startedAt: new Date().toISOString(),
          },
        }));
        triggerAgentRunExecution(result.jobId);
        void refreshJob(result.jobId);
      }
    } finally {
      setRunning(false);
      await refresh();
    }
  }, [refresh, refreshJob]);

  useEffect(() => {
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!queuedJob) return;
    if (watchedJob?.id === queuedJob.id && !isActiveStatus(watchedJob.status)) {
      void refresh();
      return;
    }
    const id = setInterval(() => void refreshJob(queuedJob.id), 3_000);
    return () => clearInterval(id);
  }, [queuedJob, refresh, refreshJob, watchedJob]);

  const disabledReason = status.circuit.halted
    ? status.circuit.reason
      ? `Circuit halted: ${status.circuit.reason}`
      : "Circuit halted"
    : undefined;

  return (
    <div className="space-y-4">
      <CircuitBanner status={status} onReset={async () => { await resetMagellanCircuit("admin"); await refresh(); }} />
      <StatusPanel status={status} />
      <BatchRunner
        onStart={start}
        disabled={running || Boolean(disabledReason)}
        busy={running}
        disabledReason={disabledReason}
        title="Repair discovery and extraction gaps"
        description="Queue Magellan to rescue institutions that need a usable fee schedule source."
        actionLabel="Start repair"
        unitLabel="institutions"
      />
      {queuedJob && (
        <JobLaunchReceipt
          jobId={queuedJob.id}
          title="Magellan repair"
          owner="magellan"
          command={`Magellan rescue pass: ${queuedJob.size} x ${queuedJob.chain}`}
          scope={`${(queuedJob.size * queuedJob.chain).toLocaleString("en-US")} institutions · ${queuedJob.chain === 1 ? "single batch" : `${queuedJob.chain} batches`}`}
          reused={queuedJob.reused}
          detail="Magellan will run a bounded agentic discovery pass, update rescued fee URLs, and write discovery evidence."
        />
      )}
      {queuedJob && (
        <MagellanJobOutcome
          job={watchedJob?.id === queuedJob.id ? watchedJob : null}
          watchError={watchError}
        />
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

function MagellanJobOutcome({
  job,
  watchError,
}: {
  job: WatchedJob | null;
  watchError: string | null;
}) {
  if (!job) {
    return (
      <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950 dark:border-blue-950 dark:bg-blue-950/25 dark:text-blue-100">
        <p className="text-sm font-semibold">Looking up job status...</p>
        <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
          Waiting for Atlas to attach the run steps and event stream.
        </p>
        {watchError && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">Status refresh failed: {watchError}</p>}
      </div>
    );
  }

  const terminal = !isActiveStatus(job.status);
  const message = jobMessage(job);

  return (
    <div role="status" className="rounded-md border border-black/[0.08] px-4 py-3 dark:border-white/[0.08]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Run #{job.id} outcome</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusTone(job.status)}`}>
              {job.status.replace("_", " ")}
            </span>
          </div>
          <p className="admin-meta mt-1">
            Backend {job.backendReceipt ?? "agentic_v1"} · {terminal ? "Terminal" : "Polling every 3 seconds"}
          </p>
        </div>
        <p className="admin-meta tabular-nums">
          {dateTime(job.completedAt ?? job.heartbeatAt ?? job.updatedAt ?? job.startedAt ?? job.createdAt)}
        </p>
      </div>
      <p className={`mt-3 text-xs ${job.error ? "font-semibold text-red-700 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
        {message}
      </p>
      {job.stdoutTail && (
        <pre className="mt-3 max-h-36 overflow-y-auto rounded-md bg-gray-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-300">
          {job.stdoutTail}
        </pre>
      )}
      {watchError && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">Status refresh failed: {watchError}</p>}
    </div>
  );
}

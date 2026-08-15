"use client";

import { useState, useTransition } from "react";
import { Activity, RotateCw } from "lucide-react";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";

type TickStateLaneResult = {
  stateCode: string;
  runId: number;
  status: string;
  reused: boolean;
};

type TickRunResult = {
  runId: number;
  status: string;
  terminal: boolean;
  executedSteps: number;
  message: string;
};

type TickResponse = {
  ok?: boolean;
  paused?: boolean;
  pauseReason?: string;
  scheduledStateLanes?: {
    selected?: number;
    scheduled?: number;
    reused?: number;
    failed?: Array<{ stateCode: string; error: string }>;
    results?: TickStateLaneResult[];
  };
  selected?: number;
  results?: TickRunResult[];
  error?: string;
};

type TickReceipt = {
  scheduled: number;
  reused: number;
  failed: number;
  selectedRuns: number;
  executedSteps: number;
  terminalRuns: number;
  followedRunId: number | null;
  message: string;
};

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function tickUrl(): string {
  const params = new URLSearchParams({
    stateLaneLimit: "2",
    runLimit: "2",
    maxStepsPerRun: "1",
  });
  return `/api/admin/agents/tick?${params.toString()}`;
}

function summarizeTick(data: TickResponse): TickReceipt {
  const scheduledStateLanes = data.scheduledStateLanes;
  const laneResults = scheduledStateLanes?.results ?? [];
  const runResults = data.results ?? [];
  const executedSteps = runResults.reduce((sum, run) => sum + Number(run.executedSteps ?? 0), 0);
  const terminalRuns = runResults.filter((run) => run.terminal).length;
  const followedRunId = laneResults[0]?.runId ?? runResults[0]?.runId ?? null;

  return {
    scheduled: Number(scheduledStateLanes?.scheduled ?? 0),
    reused: Number(scheduledStateLanes?.reused ?? 0),
    failed: scheduledStateLanes?.failed?.length ?? 0,
    selectedRuns: Number(data.selected ?? 0),
    executedSteps,
    terminalRuns,
    followedRunId,
    message: runResults[0]?.message ?? (
      laneResults[0]
        ? `Atlas scheduled ${laneResults[0].stateCode} state lane.`
        : "Atlas tick completed without queued work."
    ),
  };
}

function announceTick(data: TickResponse, receipt: TickReceipt): void {
  const lane = data.scheduledStateLanes?.results?.[0];
  const run = data.results?.[0];
  const runId = lane?.runId ?? run?.runId;
  if (!runId) return;

  window.dispatchEvent(new CustomEvent("atlas:started", {
    detail: {
      runId,
      title: lane ? `Atlas ${lane.stateCode} state lane` : `Atlas run #${runId}`,
      label: lane ? `Atlas ${lane.stateCode} state lane` : "Atlas tick",
      agent: "atlas",
      reused: lane?.reused ?? false,
      startedAt: new Date().toISOString(),
    },
  }));
  if (!run?.terminal) triggerAgentRunExecution(runId);
  if (receipt.followedRunId && receipt.followedRunId !== runId) {
    triggerAgentRunExecution(receipt.followedRunId);
  }
}

export function AtlasTickControl({
  disabled = false,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<TickReceipt | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function tick() {
    setReceipt(null);
    setError(null);
    setStatusMessage("Asking Atlas to schedule due lanes and drain queued steps...");

    startTransition(async () => {
      try {
        const response = await fetch(tickUrl(), { cache: "no-store" });
        const data = await response.json() as TickResponse;
        if (!response.ok || data.ok === false) {
          throw new Error(data.error ?? `Atlas tick failed with HTTP ${response.status}`);
        }
        if (data.paused) {
          setStatusMessage(null);
          setError(data.pauseReason ?? "Atlas tick is paused.");
          return;
        }
        const nextReceipt = summarizeTick(data);
        setReceipt(nextReceipt);
        setStatusMessage(null);
        announceTick(data, nextReceipt);
      } catch (caught) {
        setStatusMessage(null);
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  return (
    <section aria-labelledby="atlas-tick-heading" className="border-y border-black/[0.06] py-4 dark:border-white/[0.06]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="admin-eyebrow">Scheduler</p>
          <h2 id="atlas-tick-heading" className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Advance Atlas now
          </h2>
          <p className="admin-meta mt-1">
            Runs the same tick path cron uses: schedule due state lanes, then execute a bounded queued step slice.
          </p>
        </div>
        <button
          type="button"
          onClick={tick}
          disabled={disabled || isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand-primary)] px-4 text-sm font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent dark:disabled:border-gray-700"
        >
          {isPending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          {isPending ? "Advancing Atlas" : "Tick Atlas now"}
        </button>
      </div>

      {disabled && disabledReason && !error && (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">{disabledReason}</p>
      )}
      {statusMessage && (
        <p role="status" className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-400">{statusMessage}</p>
      )}
      {receipt && (
        <div role="status" className="mt-4 grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950 sm:grid-cols-2 lg:grid-cols-5 dark:border-blue-950 dark:bg-blue-950/25 dark:text-blue-100">
          <TickMetric label="State lanes" value={`${number(receipt.scheduled)} scheduled · ${number(receipt.reused)} reused`} />
          <TickMetric label="Lane failures" value={number(receipt.failed)} />
          <TickMetric label="Queued runs" value={number(receipt.selectedRuns)} />
          <TickMetric label="Steps executed" value={number(receipt.executedSteps)} />
          <TickMetric label="Terminal runs" value={number(receipt.terminalRuns)} />
          <p className="sm:col-span-2 lg:col-span-5">{receipt.message}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

function TickMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

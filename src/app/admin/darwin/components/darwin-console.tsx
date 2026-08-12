"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BatchRunner,
  type BatchSizeOption,
} from "@/components/agent-console/batch-runner";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { DecisionStream, type Decision } from "./decision-stream";
import { CircuitBanner } from "@/components/agent-console/circuit-banner";
import { BudgetGauge } from "./budget-gauge";
import { fetchDarwinStatus, resetDarwinCircuit, fetchDarwinReasoning, fetchReasoningFromR2, reclassifyFee, runDarwinRepair } from "../actions";
import type { DarwinStatus } from "../types";

type QueuedJob = {
  id: number;
  size: BatchSizeOption;
  chain: number;
  reused: boolean;
};

export function DarwinConsole({ initialStatus }: { initialStatus: DarwinStatus }) {
  const [status, setStatus] = useState<DarwinStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [queuedJob, setQueuedJob] = useState<QueuedJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState<number>(0);

  // Drawer state
  const [expanded, setExpanded] = useState<Decision | null>(null);
  const [reasoning, setReasoning] = useState<{
    prompt: string | null;
    output: string | null;
    r2_key: string | null;
    created_at: string | null;
  } | null>(null);
  const [reasoningLoading, setReasoningLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await fetchDarwinStatus()); } catch {}
  }, []);

  const start = useCallback(async (size: BatchSizeOption, chain: number) => {
    setRunning(true);
    setDecisions([]);
    setQueuedJob(null);
    setError(null);
    try {
      const result = await runDarwinRepair(size, chain);
      if (!result.success) {
        setError(result.error ?? "Darwin repair could not be queued");
      } else if (typeof result.jobId === "number") {
        setQueuedJob({ id: result.jobId, size, chain, reused: Boolean(result.reused) });
      }
    } finally {
      setRunning(false);
      await refreshStatus();
    }
  }, [refreshStatus]);

  useEffect(() => {
    const id = setInterval(refreshStatus, 10_000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const handleReset = useCallback(async () => {
    await resetDarwinCircuit("admin");
    await refreshStatus();
  }, [refreshStatus]);

  const handleRowClick = useCallback(async (d: Decision) => {
    setExpanded(d);
    setReasoning(null);
    setReasoningLoading(true);
    try {
      const result = await fetchDarwinReasoning(d.fee_raw_id);
      let prompt = result.reasoning_prompt;
      let output = result.reasoning_output;
      // Auto-fetch from R2 if text is stored there instead of inline.
      if (result.reasoning_r2_key && prompt == null && output == null) {
        try {
          const r2 = await fetchReasoningFromR2(result.reasoning_r2_key);
          prompt = r2.prompt;
          output = r2.output;
        } catch {
          // R2 fetch failed — leave null; UI will show "not stored"
        }
      }
      setReasoning({
        prompt,
        output,
        r2_key: result.reasoning_r2_key,
        created_at: result.created_at,
      });
    } finally {
      setReasoningLoading(false);
    }
  }, []);

  const filteredRows = decisions.filter(
    (r) =>
      (filterOutcome === "all" || r.outcome === filterOutcome) &&
      (r.confidence == null || r.confidence >= minConfidence),
  );
  const disabledReason = status.circuit.halted
    ? status.circuit.reason
      ? `Circuit halted: ${status.circuit.reason}`
      : "Circuit halted"
    : undefined;

  return (
    <div className="space-y-4">
      <CircuitBanner status={status} onReset={handleReset} />
      <BudgetGauge status={status} />
      <BatchRunner
        onStart={start}
        disabled={running || status.circuit.halted}
        busy={running}
        disabledReason={disabledReason}
        title="Classify raw fee rows"
        description="Queue Darwin to promote unclassified fees into verified categories."
        actionLabel="Start classification"
        unitLabel="fees"
      />
      {queuedJob && (
        <JobLaunchReceipt
          jobId={queuedJob.id}
          title="Darwin classification"
          owner="darwin"
          command={`darwin-drain --size ${queuedJob.size} --batches ${queuedJob.chain}`}
          scope={`${(queuedJob.size * queuedJob.chain).toLocaleString("en-US")} fees · ${queuedJob.chain === 1 ? "single batch" : `${queuedJob.chain} batches`}`}
          reused={queuedJob.reused}
          detail="Darwin will promote raw fee rows into verified categories. Atlas live status shows the Modal call, heartbeat, and latest output."
        />
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}

      {/* Filter bar */}
      <div className="admin-card p-3 flex items-center gap-3 text-[11px]">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Outcome
          </label>
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="mt-1 px-2 py-1 border border-gray-300 rounded"
          >
            <option value="all">All</option>
            <option value="promoted">Promoted</option>
            <option value="cached_low_conf">Cached</option>
            <option value="rejected">Rejected</option>
            <option value="failure">Failure</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Min confidence
          </label>
          <div className="flex items-center gap-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="mt-1 w-32"
            />
            <span className="tabular-nums">{minConfidence.toFixed(2)}</span>
          </div>
        </div>
        <div className="ml-auto text-gray-400">
          {filteredRows.length} of {decisions.length}
        </div>
      </div>

      <DecisionStream decisions={filteredRows} onRowClick={handleRowClick} />

      {/* Reasoning drawer */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-end justify-center"
          onClick={() => setExpanded(null)}
        >
          <div
            className="bg-white w-full max-w-3xl max-h-[70vh] overflow-y-auto rounded-t-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  fee_raw_id {expanded.fee_raw_id}
                </div>
                <div className="text-lg font-bold">{expanded.fee_name ?? "—"}</div>
                <div className="text-[11px] text-gray-500 mt-1">
                  {expanded.outcome} • {expanded.key ?? "no key"} • confidence{" "}
                  {expanded.confidence?.toFixed(2) ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!expanded) return;
                    setReasoningLoading(true);
                    try {
                      const r = await reclassifyFee(expanded.fee_raw_id);
                      setReasoning({
                        prompt: r.prompt,
                        output: r.output,
                        r2_key: null,
                        created_at: "(live reclassify)",
                      });
                    } finally {
                      setReasoningLoading(false);
                    }
                  }}
                  className="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Re-classify
                </button>
                <button
                  onClick={() => setExpanded(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {reasoningLoading && (
              <div className="text-sm text-gray-500">Loading reasoning…</div>
            )}

            {!reasoningLoading && reasoning && (
              <>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-4">
                  Reasoning output
                </div>
                <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-3 mt-1 whitespace-pre-wrap overflow-x-auto">
                  {reasoning.output ?? "not stored"}
                </pre>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-4">
                  Prompt
                </div>
                <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-3 mt-1 whitespace-pre-wrap overflow-x-auto">
                  {reasoning.prompt ?? "not stored"}
                </pre>
                <div className="text-[10px] text-gray-400 mt-2">
                  Logged {reasoning.created_at ?? "—"}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

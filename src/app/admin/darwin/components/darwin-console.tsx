"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BatchRunner,
  type BatchSizeOption,
} from "@/components/agent-console/batch-runner";
import { DecisionStream, rowFromEvent, type Decision } from "./decision-stream";
import { CircuitBanner } from "@/components/agent-console/circuit-banner";
import { BudgetGauge } from "./budget-gauge";
import { fetchDarwinStatus, resetDarwinCircuit, fetchDarwinReasoning, fetchReasoningFromR2, reclassifyFee } from "../actions";
import type { BatchEvent, BatchResult, DarwinStatus } from "../types";

type RunningTotals = {
  promoted: number;
  cached: number;
  rejected: number;
  failure: number;
};

const ZERO_TOTALS: RunningTotals = { promoted: 0, cached: 0, rejected: 0, failure: 0 };

export function DarwinConsole({ initialStatus }: { initialStatus: DarwinStatus }) {
  const [status, setStatus] = useState<DarwinStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [runningTotals, setRunningTotals] = useState<RunningTotals>(ZERO_TOTALS);

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

  const runOne = useCallback((size: BatchSizeOption): Promise<void> => {
    return new Promise((resolve) => {
      const es = new EventSource(`/api/admin/darwin/stream?size=${size}`);
      const handle = (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data) as BatchEvent;
          if (payload.type === "row_complete") {
            const row = rowFromEvent(payload);
            if (row) {
              setDecisions((prev) => [row, ...prev].slice(0, 200));
              const outcomeKey =
                payload.outcome === "cached_low_conf" ? "cached" : payload.outcome;
              setRunningTotals((prev) => ({
                ...prev,
                [outcomeKey]: (prev[outcomeKey as keyof RunningTotals] ?? 0) + 1,
              }));
            }
          } else if (payload.type === "done") {
            setLastResult(payload.result);
            es.close();
            resolve();
          } else if (payload.type === "halted" || payload.type === "error") {
            es.close();
            resolve();
          }
        } catch {
          /* ignore parse errors */
        }
      };
      ["row_complete", "done", "halted", "error"].forEach((t) => {
        es.addEventListener(t, (ev) => handle(ev as MessageEvent));
      });
      es.onerror = () => { es.close(); resolve(); };
    });
  }, []);

  const start = useCallback(async (size: BatchSizeOption, chain: number) => {
    setRunning(true);
    setDecisions([]);
    setRunningTotals(ZERO_TOTALS);
    try {
      for (let i = 0; i < chain; i++) {
        await runOne(size);
        await refreshStatus();
        if ((await fetchDarwinStatus()).circuit.halted) break;
      }
    } finally {
      setRunning(false);
      await refreshStatus();
    }
  }, [runOne, refreshStatus]);

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

  const totalsAreNonZero =
    runningTotals.promoted + runningTotals.cached + runningTotals.rejected + runningTotals.failure > 0;

  return (
    <div className="space-y-4">
      <CircuitBanner status={status} onReset={handleReset} />
      <BudgetGauge />
      <BatchRunner onStart={start} disabled={running || status.circuit.halted} />

      {lastResult && (
        <div className="admin-card p-3 text-[11px] text-gray-600 flex gap-4 tabular-nums">
          <span>processed: <b>{lastResult.processed}</b></span>
          <span>promoted: <b>{lastResult.promoted}</b></span>
          <span>cached: <b>{lastResult.cached_low_conf}</b></span>
          <span>rejected: <b>{lastResult.rejected}</b></span>
          <span>failures: <b>{lastResult.failures}</b></span>
          <span>cache hits: <b>{lastResult.cache_hits}</b></span>
          <span>duration: <b>{lastResult.duration_s.toFixed(1)}s</b></span>
        </div>
      )}

      {(running || totalsAreNonZero) && (
        <div className="admin-card p-3 text-[11px] text-gray-600 flex gap-4 tabular-nums">
          <span>This run:</span>
          <span className="text-emerald-700">promoted: <b>{runningTotals.promoted}</b></span>
          <span className="text-amber-700">cached: <b>{runningTotals.cached}</b></span>
          <span className="text-gray-500">rejected: <b>{runningTotals.rejected}</b></span>
          <span className="text-red-700">failed: <b>{runningTotals.failure}</b></span>
        </div>
      )}

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

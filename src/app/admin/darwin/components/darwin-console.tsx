"use client";

import { useEffect, useState, useCallback } from "react";
import { BatchRunner } from "./batch-runner";
import { DecisionStream, rowFromEvent } from "./decision-stream";
import { CircuitBanner } from "./circuit-banner";
import { BudgetGauge } from "./budget-gauge";
import { fetchDarwinStatus } from "../actions";
import type { BatchEvent, BatchResult, BatchSize, DarwinStatus } from "../types";

type Decision = NonNullable<ReturnType<typeof rowFromEvent>>;

export function DarwinConsole({ initialStatus }: { initialStatus: DarwinStatus }) {
  const [status, setStatus] = useState<DarwinStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await fetchDarwinStatus()); } catch {}
  }, []);

  const runOne = useCallback((size: BatchSize): Promise<void> => {
    return new Promise((resolve) => {
      const es = new EventSource(`/api/admin/darwin/stream?size=${size}`);
      const handle = (ev: MessageEvent, eventType: string) => {
        try {
          const payload = JSON.parse(ev.data) as BatchEvent;
          if (payload.type === "row_complete") {
            const row = rowFromEvent(payload);
            if (row) setDecisions((prev) => [row, ...prev].slice(0, 200));
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
        es.addEventListener(t, (ev) => handle(ev as MessageEvent, t));
      });
      es.onerror = () => { es.close(); resolve(); };
    });
  }, []);

  const start = useCallback(async (size: BatchSize, chain: number) => {
    setRunning(true);
    setDecisions([]);
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

  return (
    <div className="space-y-4">
      <CircuitBanner status={status} onReset={refreshStatus} />
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
      <DecisionStream decisions={decisions} />
    </div>
  );
}

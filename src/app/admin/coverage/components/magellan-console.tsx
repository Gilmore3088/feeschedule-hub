"use client";

import { useCallback, useEffect, useState } from "react";
import { BatchRunner, type BatchSizeOption } from "@/components/agent-console/batch-runner";
import { CircuitBanner } from "@/components/agent-console/circuit-banner";
import { StatusPanel } from "./status-panel";
import { RescueStream, rowFromEvent } from "./rescue-stream";
import { fetchMagellanStatus, resetMagellanCircuit } from "../actions";
import type { MagellanStatus, RescueEvent, RescueResult } from "../types";

type Row = NonNullable<ReturnType<typeof rowFromEvent>>;

export function MagellanConsole({ initialStatus }: { initialStatus: MagellanStatus }) {
  const [status, setStatus] = useState<MagellanStatus>(initialStatus);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [lastResult, setLastResult] = useState<RescueResult | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await fetchMagellanStatus()); } catch {}
  }, []);

  const runOne = useCallback((size: BatchSizeOption): Promise<void> =>
    new Promise((resolve) => {
      const es = new EventSource(`/api/admin/coverage/stream?size=${size}`);
      const handle = (ev: MessageEvent) => {
        try {
          const p = JSON.parse(ev.data) as RescueEvent;
          if (p.type === "row_complete") {
            const r = rowFromEvent(p);
            if (r) setRows((prev) => [r, ...prev].slice(0, 200));
          } else if (p.type === "done") {
            setLastResult(p.result);
            es.close(); resolve();
          } else if (p.type === "halted" || p.type === "error") {
            es.close(); resolve();
          }
        } catch { /* ignore */ }
      };
      ["row_complete", "done", "halted", "error"].forEach((t) =>
        es.addEventListener(t, (ev) => handle(ev as MessageEvent))
      );
      es.onerror = () => { es.close(); resolve(); };
    }),
  []);

  const start = useCallback(async (size: BatchSizeOption, chain: number) => {
    setRunning(true);
    setRows([]);
    try {
      for (let i = 0; i < chain; i++) {
        await runOne(size);
        await refresh();
        if ((await fetchMagellanStatus()).circuit.halted) break;
      }
    } finally {
      setRunning(false);
      await refresh();
    }
  }, [runOne, refresh]);

  useEffect(() => {
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <CircuitBanner status={status} onReset={async () => { await resetMagellanCircuit("admin"); await refresh(); }} />
      <StatusPanel status={status} />
      <BatchRunner onStart={start} disabled={running || status.circuit.halted} />
      {lastResult && (
        <div className="admin-card p-3 text-[11px] text-gray-600 flex gap-4 tabular-nums flex-wrap">
          <span>processed: <b>{lastResult.processed}</b></span>
          <span>rescued: <b>{lastResult.rescued}</b></span>
          <span>dead: <b>{lastResult.dead}</b></span>
          <span>needs review: <b>{lastResult.needs_human}</b></span>
          <span>retry after: <b>{lastResult.retry_after}</b></span>
          <span>cost: <b>${lastResult.cost_usd.toFixed(2)}</b></span>
          <span>duration: <b>{lastResult.duration_s.toFixed(1)}s</b></span>
        </div>
      )}
      <RescueStream rows={rows} />
    </div>
  );
}

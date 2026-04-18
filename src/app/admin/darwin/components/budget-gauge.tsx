"use client";

import { useEffect, useState } from "react";
import { fetchDarwinStatus } from "../actions";
import type { DarwinStatus } from "../types";

export function BudgetGauge() {
  const [status, setStatus] = useState<DarwinStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const s = await fetchDarwinStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err)
    return (
      <div className="text-xs text-red-600">status error: {err}</div>
    );
  if (!status) return <div className="skeleton h-20 w-full" />;

  return (
    <div className="admin-card p-4">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        Today
      </div>
      <div className="mt-2 flex items-baseline gap-4">
        <div>
          <div className="text-lg font-bold tabular-nums">
            {status.today_promoted.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">promoted</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">
            ${status.today_cost_usd.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400">spent</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">
            {status.pending.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">pending</div>
        </div>
      </div>
    </div>
  );
}

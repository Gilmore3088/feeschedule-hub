"use client";

import { useState } from "react";
import type { AgentStatus } from "./types";

export function CircuitBanner({
  status,
  onReset,
}: {
  status: AgentStatus;
  onReset: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!status.circuit.halted) return null;

  async function reset() {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 flex items-center justify-between">
      <div>
        <div className="text-sm font-bold text-red-700">Agent halted</div>
        <div className="text-[11px] text-red-600">
          Reason: {status.circuit.reason ?? "unknown"}
        </div>
      </div>
      <button
        onClick={reset}
        disabled={busy}
        className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
      >
        {busy ? "Resetting..." : "Reset"}
      </button>
    </div>
  );
}

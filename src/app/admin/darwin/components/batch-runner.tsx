"use client";

import { useState } from "react";
import { BATCH_SIZES, type BatchSize } from "../types";

export function BatchRunner({
  onStart, disabled,
}: {
  onStart: (size: BatchSize, chain: number) => void;
  disabled: boolean;
}) {
  const [size, setSize] = useState<BatchSize>(500);
  const [chain, setChain] = useState(1);

  return (
    <div className="admin-card p-4 flex items-end gap-3">
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Batch size
        </label>
        <select
          value={size}
          onChange={(e) => setSize(parseInt(e.target.value, 10) as BatchSize)}
          disabled={disabled}
          className="mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
        >
          {BATCH_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Chain N
        </label>
        <input
          type="number"
          min={1} max={20} value={chain}
          onChange={(e) => setChain(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
          disabled={disabled}
          className="mt-1 px-2 py-1 border border-gray-300 rounded text-sm w-16"
        />
      </div>
      <button
        onClick={() => onStart(size, chain)}
        disabled={disabled}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded hover:bg-gray-800 disabled:opacity-50"
      >
        {disabled ? "Running..." : `Classify next ${size * chain}`}
      </button>
    </div>
  );
}

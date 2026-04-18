"use client";

import type { MagellanStatus } from "../types";

export function StatusPanel({ status }: { status: MagellanStatus }) {
  const tiles = [
    { label: "Pending", value: status.pending, color: "text-gray-900" },
    { label: "Rescued", value: status.rescued, color: "text-emerald-700" },
    { label: "Dead", value: status.dead, color: "text-gray-500" },
    { label: "Needs review", value: status.needs_human, color: "text-amber-700" },
    { label: "Retry after", value: status.retry_after, color: "text-blue-700" },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="admin-card p-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t.label}</div>
          <div className={`text-lg font-bold tabular-nums mt-1 ${t.color}`}>{t.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

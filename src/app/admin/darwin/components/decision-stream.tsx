"use client";

import type { BatchEvent } from "../types";

type Decision = {
  fee_raw_id: number;
  fee_name?: string;
  outcome: "promoted" | "cached_low_conf" | "rejected" | "failure";
  key?: string | null;
  confidence?: number;
  error?: string;
};

function rowFromEvent(ev: BatchEvent): Decision | null {
  if (ev.type !== "row_complete") return null;
  return {
    fee_raw_id: ev.fee_raw_id,
    fee_name: ev.fee_name,
    outcome: ev.outcome,
    key: ev.key ?? null,
    confidence: ev.confidence,
    error: ev.error,
  };
}

const outcomeColor: Record<Decision["outcome"], string> = {
  promoted: "bg-emerald-50 text-emerald-700",
  cached_low_conf: "bg-amber-50 text-amber-700",
  rejected: "bg-gray-50 text-gray-600",
  failure: "bg-red-50 text-red-700",
};

export function DecisionStream({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <div className="admin-card p-4 text-sm text-gray-500">
        No decisions yet — click Classify to start.
      </div>
    );
  }
  return (
    <div className="admin-card overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50/80">
          <tr>
            {["ID", "Fee name", "Outcome", "Canonical key", "Confidence", "Note"].map((h) => (
              <th
                key={h}
                className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.fee_raw_id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-2.5 text-sm tabular-nums">{d.fee_raw_id}</td>
              <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[240px] truncate">{d.fee_name ?? "—"}</td>
              <td className="px-4 py-2.5">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${outcomeColor[d.outcome]}`}
                >
                  {d.outcome}
                </span>
              </td>
              <td className="px-4 py-2.5 text-sm">{d.key ?? "—"}</td>
              <td className="px-4 py-2.5 text-sm tabular-nums">
                {d.confidence?.toFixed(2) ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-[11px] text-gray-400">{d.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { rowFromEvent };

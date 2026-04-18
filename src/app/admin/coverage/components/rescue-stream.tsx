"use client";

import type { RescueEvent } from "../types";

type Row = {
  target_id: number;
  outcome: "rescued" | "dead" | "needs_human" | "retry_after" | "failure";
  rung?: string;
  fees?: number;
  error?: string;
};

export function rowFromEvent(ev: RescueEvent): Row | null {
  if (ev.type !== "row_complete") return null;
  return {
    target_id: ev.target_id,
    outcome: ev.outcome,
    rung: ev.rung,
    fees: ev.fees,
    error: ev.error,
  };
}

const outcomeColor: Record<Row["outcome"], string> = {
  rescued: "bg-emerald-50 text-emerald-700",
  dead: "bg-gray-50 text-gray-500",
  needs_human: "bg-amber-50 text-amber-700",
  retry_after: "bg-blue-50 text-blue-700",
  failure: "bg-red-50 text-red-700",
};

export function RescueStream({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <div className="admin-card p-4 text-sm text-gray-500">No rescues yet — click Rescue to start.</div>;
  }
  return (
    <div className="admin-card overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50/80">
          <tr>
            {["Target", "Outcome", "Rung", "Fees", "Note"].map((h) => (
              <th key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.target_id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-2.5 text-sm tabular-nums">{r.target_id}</td>
              <td className="px-4 py-2.5">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${outcomeColor[r.outcome]}`}>{r.outcome}</span>
              </td>
              <td className="px-4 py-2.5 text-sm">{r.rung ?? "—"}</td>
              <td className="px-4 py-2.5 text-sm tabular-nums">{r.fees ?? "—"}</td>
              <td className="px-4 py-2.5 text-[11px] text-gray-400">{r.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

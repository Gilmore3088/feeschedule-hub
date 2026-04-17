"use client";

import { useState } from "react";
import type { ReasoningTraceRow } from "@/lib/crawler-db/agent-console-types";

type Props = {
  rows: ReasoningTraceRow[];
};

function PayloadPreview({ payload }: { payload: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (payload === null || payload === undefined) {
    return <span className="text-gray-300">—</span>;
  }
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);
  const short = str.length > 200 ? `${str.slice(0, 200)}…` : str;
  return (
    <div className="flex flex-col gap-1">
      <code className="text-[10px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
        {expanded ? str : short}
      </code>
      {str.length > 200 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[10px] text-blue-600 hover:underline"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

export function Timeline({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="admin-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No trace rows for this correlation_id.
      </div>
    );
  }

  // rows are already sorted by created_at ASC from the query, but sort defensively here
  const sorted = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );

  return (
    <ol className="flex flex-col gap-2">
      {sorted.map((row, i) => (
        <li
          key={`${row.kind}-${row.row_id}-${i}`}
          data-testid="timeline-row"
          data-kind={row.kind}
          className="admin-card p-3 flex flex-col gap-2"
        >
          <div className="flex items-center gap-3 text-[11px]">
            <span
              data-testid="kind-badge"
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                row.kind === "event"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              {row.kind}
            </span>
            <span className="font-mono text-gray-500 dark:text-gray-400 tabular-nums">
              {row.created_at.replace("T", " ").slice(0, 19)}
            </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {row.agent_name}
            </span>
            {row.intent_or_action && (
              <span className="text-gray-600 dark:text-gray-300">
                {row.intent_or_action}
              </span>
            )}
            {row.tool_name && (
              <span className="text-[10px] text-gray-400 font-mono">
                {row.tool_name}
              </span>
            )}
            {row.entity && (
              <span className="ml-auto text-[10px] text-gray-400 font-mono">
                {row.entity}
              </span>
            )}
          </div>
          <PayloadPreview payload={row.payload} />
        </li>
      ))}
    </ol>
  );
}

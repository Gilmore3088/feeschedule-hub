"use client";

import Link from "next/link";
import type { MessageThread } from "@/lib/crawler-db/agent-console-types";

/**
 * Thread-view MVP stub (plan 62B-10 Task 1 File 8).
 *
 * Phase 62b-10 MVP routes thread detail to the Replay tab (read-only timeline of
 * v_agent_reasoning_trace) rather than rendering an in-place thread expander.
 * This component exposes a simple header summary for embed contexts and a link
 * through to Replay — a richer in-place expander is a future UI polish task
 * (see 62B CONTEXT §Deferred "Cross-agent handshake replay").
 */
export function ThreadView({ thread }: { thread: MessageThread }) {
  return (
    <div className="admin-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-mono text-gray-400">
          {thread.correlation_id.slice(0, 8)}…
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-white/[0.05] text-gray-700 dark:text-gray-200">
          {thread.latest_state || "unknown"}
        </span>
        <span className="text-gray-500">round {thread.round_count}</span>
        <Link
          href={`/admin/agents/replay?correlation=${encodeURIComponent(thread.correlation_id)}`}
          className="ml-auto text-blue-600 dark:text-blue-400 hover:underline"
        >
          View full trace →
        </Link>
      </div>
      <div className="text-[12px] text-gray-700 dark:text-gray-200">
        {thread.latest_intent}
      </div>
      <div className="text-[11px] text-gray-400">
        {thread.participants.join(", ")}
      </div>
    </div>
  );
}

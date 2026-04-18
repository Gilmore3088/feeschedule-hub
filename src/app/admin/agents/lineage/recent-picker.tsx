"use client";

import Link from "next/link";
import type { RecentPublishedFee } from "@/lib/crawler-db/agent-console-types";

type Props = {
  items: RecentPublishedFee[];
};

export function RecentPicker({ items }: Props) {
  if (items.length === 0) {
    return (
      <section
        data-testid="recent-picker-empty"
        className="admin-card p-4"
        aria-label="Recent published fees — empty"
      >
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Recent Traces
        </h2>
        <p className="mt-2 text-[12px] text-gray-600 dark:text-gray-300">
          No published fees yet — run the pipeline (Darwin verifies, Knox extracts,
          Hamilton reviews) to produce fee_published rows before tracing.
        </p>
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          Once published fees exist they will appear here as clickable shortcuts.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="recent-picker"
      className="admin-card p-3"
      aria-label="Recent published fees"
    >
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1 pb-2">
        Recent Traces — click a row to load its lineage
      </h2>
      <ul className="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.06]">
        {items.map((it) => (
          <li key={it.fee_published_id}>
            <Link
              href={`/admin/agents/lineage?fee=${it.fee_published_id}`}
              className="flex items-center gap-3 px-2 py-2 min-h-11 rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
            >
              <span
                className="text-[11px] font-mono tabular-nums text-gray-900 dark:text-gray-100 w-20"
                data-testid="recent-picker-id"
              >
                #{it.fee_published_id}
              </span>
              <span className="text-[12px] text-gray-700 dark:text-gray-200 flex-1 truncate">
                {it.fee_name || it.canonical_fee_key}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                inst {it.institution_id}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                {it.published_at.slice(0, 10)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

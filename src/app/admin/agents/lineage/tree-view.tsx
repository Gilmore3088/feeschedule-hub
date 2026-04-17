"use client";

import { useState } from "react";
import { Collapsible } from "radix-ui";
import type {
  LineageGraph,
  LineageTier1,
  LineageTier2,
  LineageTier3,
} from "@/lib/crawler-db/agent-console-types";

type Props = {
  graph: LineageGraph;
};

function RowGrid({
  tier,
  row,
}: {
  tier: "TIER 3" | "TIER 2" | "TIER 1";
  row: Record<string, unknown>;
}) {
  const entries = Object.entries(row).filter(
    ([k]) => !k.startsWith("_") && k !== "row",
  );
  return (
    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px] tabular-nums">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 col-span-2 md:col-span-3">
        {tier}
      </dt>
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-[9px] uppercase tracking-wider text-gray-400">
            {k}
          </dt>
          <dd className="text-gray-900 dark:text-gray-200 truncate">
            {v === null || v === undefined ? (
              <span className="text-gray-300">—</span>
            ) : typeof v === "object" ? (
              <code className="text-[10px]">{JSON.stringify(v)}</code>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Only render r2_key as a clickable link when it's an https:// URL.
// Defends against javascript: / data: / file: scheme injection if a malformed
// key ever lands in the JSONB column (Knox writes these in Phase 63).
function isSafeR2Url(value: string | null): value is string {
  if (!value) return false;
  return /^https:\/\//i.test(value);
}

function Tier1Node({ node }: { node: LineageTier1 }) {
  const r2 = node.r2_key ?? null;
  const [open, setOpen] = useState(false);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-emerald-300/50 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/[0.04] p-3 my-2">
        <div className="flex items-center justify-between gap-2">
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
              aria-label="Tier 1 extraction"
            >
              <span className="font-mono">{open ? "▼" : "▶"}</span>
              <span>TIER 1 · extraction</span>
            </button>
          </Collapsible.Trigger>
          {isSafeR2Url(r2) ? (
            <a
              href={r2}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open R2 source document ${r2} in a new tab`}
              className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[60%]"
            >
              {r2}
              <span aria-hidden="true"> ↗</span>
            </a>
          ) : r2 ? (
            <span
              title="R2 key is not a safe https:// URL; rendered as plain text"
              className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate max-w-[60%]"
            >
              {r2}
            </span>
          ) : null}
        </div>
        <Collapsible.Content className="mt-2">
          <RowGrid tier="TIER 1" row={node.row} />
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

function Tier2Node({ node }: { node: LineageTier2 }) {
  const [open, setOpen] = useState(false);
  const children = node.children ?? [];

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-blue-300/50 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/[0.04] p-3 my-2">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            aria-label="Tier 2 verification"
          >
            <span className="font-mono">{open ? "▼" : "▶"}</span>
            <span>TIER 2 · verification ({children.length} child)</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-2">
          <RowGrid tier="TIER 2" row={node.row} />
          <div className="mt-3 pl-4 border-l border-blue-200/50 dark:border-blue-500/20">
            {children.map((c, i) => (
              <Tier1Node key={i} node={c.tier_1} />
            ))}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

function Tier3Node({ node }: { node: LineageTier3 }) {
  // Default expanded per D-14: "Tier 3 default-expanded; Tier 2 and Tier 1 default-collapsed."
  const [open, setOpen] = useState(true);
  const children = node.children ?? [];

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-purple-300/50 dark:border-purple-500/20 bg-purple-50/30 dark:bg-purple-500/[0.04] p-3">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-[12px] font-bold text-purple-800 dark:text-purple-300 hover:underline"
            aria-label="Tier 3 published"
          >
            <span className="font-mono">{open ? "▼" : "▶"}</span>
            <span>TIER 3 · published ({children.length} child)</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-2">
          <RowGrid tier="TIER 3" row={node.row} />
          <div className="mt-3 pl-4 border-l border-purple-200/50 dark:border-purple-500/20">
            {children.map((c, i) => (
              <Tier2Node key={i} node={c.tier_2} />
            ))}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

export function TreeView({ graph }: Props) {
  if (!graph || !graph.tier_3) {
    return (
      <div className="admin-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No lineage found for this fee_published_id.
      </div>
    );
  }
  return <Tier3Node node={graph.tier_3} />;
}

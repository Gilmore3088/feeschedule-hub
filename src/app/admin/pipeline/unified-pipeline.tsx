"use client";

import { useState } from "react";
import Link from "next/link";

interface PipelineStage {
  id: string;
  name: string;
  count: number;
  total: number;
  pct: number;
  actionLabel: string;
  actionHref?: string;
  description: string;
  breakdowns?: { label: string; count: number; href?: string; color?: string }[];
}

interface UnifiedPipelineProps {
  stages: PipelineStage[];
}

export function UnifiedPipeline({ stages }: UnifiedPipelineProps) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const selected = stages.find((s) => s.id === selectedStage);

  function pctColor(pct: number): string {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    if (pct >= 20) return "bg-orange-500";
    return "bg-red-500";
  }

  function pctTextColor(pct: number): string {
    if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    if (pct >= 20) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <div className="admin-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Pipeline Status
        </h2>
        {selected && (
          <button
            onClick={() => setSelectedStage(null)}
            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Close detail
          </button>
        )}
      </div>

      {/* Stage bars */}
      <div className="p-5">
        <div className="flex gap-2">
          {stages.map((stage, i) => (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(selectedStage === stage.id ? null : stage.id)}
              className={`flex-1 text-left group transition-all rounded-lg p-3 ${
                selectedStage === stage.id
                  ? "bg-gray-100 dark:bg-white/[0.08] ring-1 ring-gray-300 dark:ring-white/[0.15]"
                  : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              {/* Stage name */}
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                {stage.name}
              </div>

              {/* Count */}
              <div className="text-[18px] font-bold tabular-nums text-gray-900 dark:text-gray-100 leading-none">
                {stage.count.toLocaleString()}
              </div>

              {/* Percentage */}
              <div className={`text-[11px] font-semibold tabular-nums mt-0.5 ${pctTextColor(stage.pct)}`}>
                {stage.pct.toFixed(0)}%
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pctColor(stage.pct)}`}
                  style={{ width: `${Math.max(stage.pct, 2)}%` }}
                />
              </div>

              {/* Arrow connector */}
              {i < stages.length - 1 && (
                <div className="hidden" />
              )}
            </button>
          ))}
        </div>

        {/* Connectors between stages */}
        <div className="flex items-center mt-1 px-3">
          {stages.map((_, i) => (
            <div key={i} className="flex-1 flex items-center">
              {i < stages.length - 1 && (
                <div className="w-full flex items-center justify-center">
                  <div className="w-full h-px bg-gray-200 dark:bg-white/[0.08]" />
                  <svg className="w-3 h-3 text-gray-300 dark:text-white/20 shrink-0 -ml-0.5" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M4 2l4 4-4 4" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel -- shown when a stage is clicked */}
      {selected && (
        <div className="border-t border-gray-200 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {selected.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {selected.description}
              </p>
            </div>
            {selected.actionHref && (
              <Link
                href={selected.actionHref}
                className="shrink-0 rounded-md bg-gray-900 dark:bg-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800 dark:hover:bg-white/[0.15] transition-colors no-underline"
              >
                {selected.actionLabel}
              </Link>
            )}
          </div>

          {/* Breakdowns */}
          {selected.breakdowns && selected.breakdowns.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {selected.breakdowns.map((b) => {
                const inner = (
                  <div
                    className={`rounded-md border px-3 py-2 ${
                      b.href
                        ? "border-gray-200 dark:border-white/[0.08] hover:border-gray-400 dark:hover:border-white/[0.2] cursor-pointer transition-colors"
                        : "border-gray-100 dark:border-white/[0.06]"
                    }`}
                  >
                    <div className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {b.count.toLocaleString()}
                    </div>
                    <div className={`text-[10px] font-medium ${b.color || "text-gray-500 dark:text-gray-400"}`}>
                      {b.label}
                    </div>
                  </div>
                );
                return b.href ? (
                  <Link key={b.label} href={b.href} className="no-underline">
                    {inner}
                  </Link>
                ) : (
                  <div key={b.label}>{inner}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

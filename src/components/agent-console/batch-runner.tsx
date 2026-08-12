"use client";

import { useState } from "react";
import { Minus, Play, Plus, RotateCw } from "lucide-react";
import { BATCH_SIZES, type BatchSizeOption } from "./types";

export { BATCH_SIZES };
export type { BatchSizeOption };

export function BatchRunner({
  onStart,
  disabled,
  busy = false,
  disabledReason,
  title = "Run next batch",
  description = "Choose a controlled scope, then queue the job through Atlas.",
  actionLabel = "Start job",
  unitLabel = "records",
}: {
  onStart: (size: BatchSizeOption, chain: number) => void;
  disabled: boolean;
  busy?: boolean;
  disabledReason?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  unitLabel?: string;
}) {
  const [size, setSize] = useState<BatchSizeOption>(500);
  const [chain, setChain] = useState(1);
  const total = size * chain;
  const helpId = disabledReason ? `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-blocked` : undefined;

  function setBoundedChain(next: number) {
    setChain(Math.max(1, Math.min(20, next)));
  }

  return (
    <div className="border-y border-black/[0.06] py-4 dark:border-white/[0.06]">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,1.2fr)_auto] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          <p className="admin-meta mt-1">{description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <fieldset disabled={disabled} className="min-w-0">
            <legend className="admin-label">Run scope</legend>
            <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]">
              {BATCH_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSize(option)}
                  aria-pressed={size === option}
                  className={`min-h-9 px-2 text-xs font-semibold transition-colors ${
                    size === option
                      ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-950"
                      : "border-l border-gray-200 text-gray-600 first:border-l-0 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="admin-label">Repeat</p>
            <div className="mt-2 flex h-9 items-center overflow-hidden rounded-md border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setBoundedChain(chain - 1)}
                disabled={disabled || chain <= 1}
                aria-label="Decrease repeat count"
                className="inline-flex h-9 w-9 items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={chain}
                onChange={(event) => setBoundedChain(parseInt(event.target.value, 10) || 1)}
                disabled={disabled}
                aria-label="Repeat count"
                className="h-9 w-12 border-x border-gray-200 bg-transparent text-center text-sm font-semibold tabular-nums text-gray-900 outline-none dark:border-white/[0.08] dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setBoundedChain(chain + 1)}
                disabled={disabled || chain >= 20}
                aria-label="Increase repeat count"
                className="inline-flex h-9 w-9 items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <div className="text-left lg:text-right">
            <p className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {total.toLocaleString("en-US")} {unitLabel}
            </p>
            <p className="admin-meta mt-1">{chain === 1 ? "Single controlled run" : `${chain} queued batches`}</p>
          </div>
          <button
            type="button"
            onClick={() => onStart(size, chain)}
            disabled={disabled}
            aria-describedby={helpId}
            className="admin-bg-brand inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-sm transition-[transform,background-color] hover:-translate-y-px hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy ? "Queueing" : actionLabel}
          </button>
          {disabledReason && (
            <p id={helpId} className="max-w-64 text-left text-[11px] font-medium text-amber-700 lg:text-right dark:text-amber-400">
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

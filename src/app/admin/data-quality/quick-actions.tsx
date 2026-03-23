"use client";

import { useTransition, useState } from "react";
import { rerunCategorization, republishIndex, resetZombieJobs } from "./actions";

interface ActionResult {
  success: boolean;
  jobId?: number;
  count?: number;
  error?: string;
}

function ActionButton({
  label,
  description,
  action,
}: {
  label: string;
  description: string;
  action: () => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await action();
      setResult(res);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
        {result && (
          <p
            className={`mt-1 text-xs ${
              result.success
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {result.success
              ? result.jobId
                ? `Job #${result.jobId} queued`
                : `Done (${result.count ?? 0} affected)`
              : result.error}
          </p>
        )}
      </div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {isPending ? "Running..." : "Run"}
      </button>
    </div>
  );
}

export function QuickActions({ canTrigger }: { canTrigger: boolean }) {
  if (!canTrigger) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        You need trigger_jobs permission to run actions.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ActionButton
        label="Re-run Categorization"
        description="Re-categorize all uncategorized fees using the taxonomy engine"
        action={rerunCategorization}
      />
      <ActionButton
        label="Re-publish Index"
        description="Recompute fee_index_cache with latest approved + staged data"
        action={republishIndex}
      />
      <ActionButton
        label="Reset Zombie Jobs"
        description="Mark jobs stuck in 'running' for 2+ hours as failed"
        action={resetZombieJobs}
      />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startPipelineRun } from "./actions";

/**
 * Control-room trigger button. Calls the startPipelineRun server action and
 * refreshes the page into the live step view. The first time a run can be
 * kicked off and watched from the admin UI.
 */
export function RunTrigger({
  stages = ["publish"],
  label = "Run publish (dry-run)",
}: {
  stages?: string[];
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const res = await startPipelineRun(stages);
      if (res.ok) {
        setMessage(`Run #${res.runId} completed`);
        setIsError(false);
      } else {
        setMessage(res.error ?? "Run failed");
        setIsError(true);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
      >
        {pending && (
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        )}
        {pending ? "Running…" : label}
      </button>
      {message && (
        <span
          className={`text-[11px] font-medium ${
            isError ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, RotateCw } from "lucide-react";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { runAtlasCycle } from "./atlas-actions";

type QueuedAtlasRun = {
  id: number;
  reused: boolean;
};

export function AtlasRunControl({
  disabled = false,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [queuedRun, setQueuedRun] = useState<QueuedAtlasRun | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setStatusMessage("Creating a visible Atlas run record...");
    setQueuedRun(null);
    setError(null);
    startTransition(async () => {
      const result = await runAtlasCycle();
      if (!result.success) {
        setStatusMessage(null);
        setError(result.error ?? "Atlas could not start the cycle");
        return;
      }
      setStatusMessage(null);
      if (typeof result.runId === "number") {
        setQueuedRun({ id: result.runId, reused: Boolean(result.reused) });
      }
      window.dispatchEvent(new CustomEvent("atlas:started", {
        detail: {
          runId: result.runId,
          title: "Atlas full data cycle",
          label: "Atlas cycle",
          agent: "atlas",
          reused: result.reused,
          startedAt: new Date().toISOString(),
        },
      }));
      if (typeof result.runId === "number") triggerAgentRunExecution(result.runId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        className="admin-bg-brand inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold shadow-sm transition-[transform,background-color] hover:-translate-y-px hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {pending ? "Queueing Atlas cycle" : "Queue full Atlas cycle"}
      </button>
      {statusMessage && (
        <p role="status" className="max-w-sm text-xs font-medium text-blue-700 dark:text-blue-400">
          {statusMessage}
        </p>
      )}
      {queuedRun && (
        <div className="w-full sm:w-[420px]">
          <JobLaunchReceipt
            jobId={queuedRun.id}
            title="Atlas full data cycle"
            owner="atlas"
            command="enhance -> discover -> fetch -> read -> extract -> classify -> review -> publish"
            scope="100-institution ledger slice"
            reused={queuedRun.reused}
            compact
            detail="Atlas created the run record first. The live panel is polling for step events, backend pickup, and any blocked reason."
          />
        </div>
      )}
      {error && <p role="alert" className="max-w-sm text-xs text-red-700 dark:text-red-400">{error}</p>}
      {disabled && disabledReason && !error && (
        <p className="max-w-sm text-xs text-amber-700 dark:text-amber-400">{disabledReason}</p>
      )}
    </div>
  );
}

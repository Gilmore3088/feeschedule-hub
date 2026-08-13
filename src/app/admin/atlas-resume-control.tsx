"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { resumeAtlasCycle } from "./atlas-actions";

export function AtlasResumeControl({ runId }: { runId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resume() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await resumeAtlasCycle(runId);
      if (!result.success) {
        setError(result.error ?? "Atlas could not resume this run");
        return;
      }
      setMessage(
        result.reused
          ? `Repair run #${result.runId} is already visible.`
          : `Repair run #${result.runId} created.`,
      );
      if (typeof result.runId === "number") {
        window.dispatchEvent(new CustomEvent("atlas:started", {
          detail: {
            runId: result.runId,
            title: `Atlas repair for run #${runId}`,
            label: `Atlas repair for run #${runId}`,
            agent: "atlas",
            reused: result.reused,
            startedAt: new Date().toISOString(),
          },
        }));
        triggerAgentRunExecution(result.runId);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={resume}
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--brand-primary)] px-3 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Resuming" : "Resume from failed stage"}
      </button>
      {message && (
        <p role="status" className="max-w-xs text-right text-[10px] text-gray-500">
          {message} <a href="#atlas-live-status" className="underline underline-offset-2">Live status</a>
        </p>
      )}
      {error && <p role="alert" className="max-w-xs text-right text-[10px] text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

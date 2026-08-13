"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, RotateCw } from "lucide-react";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { runAtlasCycle } from "./atlas-actions";

export function AtlasRunControl({
  disabled = false,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setMessage("Request sent. Creating the job record and checking the agentic backend...");
    setError(null);
    startTransition(async () => {
      const result = await runAtlasCycle();
      if (!result.success) {
        setMessage(null);
        setError(result.error ?? "Atlas could not start the cycle");
        return;
      }
      setMessage(
        result.reused
          ? `Atlas run #${result.runId} is already visible.`
          : `Atlas run #${result.runId} created.`,
      );
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
        {pending ? "Starting Atlas" : "Start Atlas"}
      </button>
      {message && (
        <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {message} <a href="#atlas-live-status" className="underline underline-offset-2">Live status</a>
        </p>
      )}
      {error && <p role="alert" className="max-w-sm text-xs text-red-700 dark:text-red-400">{error}</p>}
      {disabled && disabledReason && !error && (
        <p className="max-w-sm text-xs text-amber-700 dark:text-amber-400">{disabledReason}</p>
      )}
    </div>
  );
}

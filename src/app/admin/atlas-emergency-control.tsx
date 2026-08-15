"use client";

import { useState, useTransition } from "react";
import { CircleStop, Play, ShieldAlert, X } from "lucide-react";
import { resumeAllAutomation, stopAllAutomation } from "./atlas-actions";

interface Props {
  enabled: boolean;
  reason: string | null;
  changedBy: string;
  changedAtLabel: string;
  activeJobCount: number;
}

export function AtlasEmergencyControl({
  enabled,
  reason,
  changedBy,
  changedAtLabel,
  activeJobCount,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [stopReason, setStopReason] = useState("Potential runaway API activity");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resumeBlockedReason = /credit balance is too low/i.test(reason ?? "")
    ? "Fix provider billing or move extraction off Anthropic before resuming."
    : null;

  function engage() {
    startTransition(async () => {
      const result = await stopAllAutomation(stopReason);
      if (!result.success) {
        setMessage(result.error ?? "Emergency stop failed");
        return;
      }
      const failureCount = result.cancellationFailures?.length ?? 0;
      setMessage(
        failureCount > 0
          ? `Stop engaged. ${result.cancelled ?? 0} runs cancelled; ${failureCount} need operator attention.`
          : `Stop engaged. ${result.cancelled ?? 0} of ${result.requested ?? 0} active runs cancelled.`,
      );
      setConfirming(false);
    });
  }

  function resume() {
    startTransition(async () => {
      const result = await resumeAllAutomation("Operator reviewed usage and resumed automation");
      setMessage(result.success ? "Automation resumed." : result.error ?? "Resume failed");
    });
  }

  if (!enabled) {
    return (
      <section id="atlas-safety" className="border-y border-red-300 bg-red-50/70 px-4 py-4 dark:border-red-900/70 dark:bg-red-950/20" aria-label="Emergency stop status">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-400" />
            <div>
              <p className="text-sm font-bold text-red-900 dark:text-red-200">Emergency stop is active</p>
              <p className="mt-1 text-xs text-red-800/80 dark:text-red-300/80">
                New worker execution, agent tools, and AI provider calls are blocked. {reason ?? "No reason recorded."}
              </p>
              <p className="mt-1 text-[10px] text-red-700/70 dark:text-red-400/70">
                Changed by {changedBy} · {changedAtLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resume}
            disabled={pending || Boolean(resumeBlockedReason)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-red-800 px-4 text-xs font-bold text-white transition-colors hover:bg-red-900 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {pending ? "Resuming..." : resumeBlockedReason ? "Resume blocked" : "Resume automation"}
          </button>
        </div>
        {resumeBlockedReason && (
          <p className="mt-3 text-xs font-medium text-red-800 dark:text-red-300" role="status">{resumeBlockedReason}</p>
        )}
        {message && <p className="mt-3 text-xs font-medium text-red-800 dark:text-red-300" role="status">{message}</p>}
      </section>
    );
  }

  return (
    <section id="atlas-safety" className="border-y border-black/[0.06] py-3 dark:border-white/[0.06]" aria-label="Emergency stop control">
      {!confirming ? (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Automation safety</p>
            <p className="admin-meta mt-1">Provider calls and scheduled work are permitted. {activeJobCount} run{activeJobCount === 1 ? "" : "s"} active.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-300 px-4 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/20"
          >
            <CircleStop className="h-4 w-4" />
            Emergency stop
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,0.7fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-bold text-red-800 dark:text-red-300">Stop all automation?</p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              The gate closes first, then Atlas cancels {activeJobCount} active agent run{activeJobCount === 1 ? "" : "s"}.
            </p>
          </div>
          <label className="block">
            <span className="admin-label">Incident reason</span>
            <input
              value={stopReason}
              onChange={(event) => setStopReason(event.target.value)}
              maxLength={500}
              className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              aria-label="Cancel emergency stop confirmation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={engage}
              disabled={pending || stopReason.trim().length < 3}
              className="h-10 rounded-md bg-red-700 px-4 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Stopping..." : "Stop all now"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-xs font-medium text-gray-700 dark:text-gray-300" role="status">{message}</p>}
    </section>
  );
}

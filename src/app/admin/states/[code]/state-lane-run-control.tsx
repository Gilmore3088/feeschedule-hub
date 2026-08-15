"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  runStateLaneFormAction,
  type StateLaneRunActionState,
} from "./actions";

const INITIAL_STATE: StateLaneRunActionState | null = null;

export function StateLaneRunControl({
  stateCode,
  blockedReason,
}: {
  stateCode: string;
  blockedReason: string | null;
}) {
  const [state, formAction, isPending] = useActionState(runStateLaneFormAction, INITIAL_STATE);
  const disabled = Boolean(blockedReason) || isPending;

  return (
    <form action={formAction} className="grid justify-items-end gap-1.5">
      <input type="hidden" name="state_code" value={stateCode} />
      <button
        type="submit"
        disabled={disabled}
        title={blockedReason ?? "Schedule this state lane"}
        className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
      >
        {isPending ? "Scheduling Lane" : blockedReason ? "State Lane Paused" : "Run State Lane"}
      </button>
      {blockedReason && (
        <p className="max-w-xs text-right text-[10px] font-medium text-amber-700 dark:text-amber-300">
          {blockedReason}
        </p>
      )}
      {state?.message && (
        <p role="status" className="max-w-xs rounded bg-emerald-50 px-2 py-1 text-right text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {state.message}
          {state.runId && state.stateCode && (
            <Link
              href={`/admin/states/${state.stateCode}/runs/${state.runId}`}
              className="ml-1 font-semibold underline underline-offset-2"
            >
              Open run
            </Link>
          )}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="max-w-xs rounded bg-red-50 px-2 py-1 text-right text-[10px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}

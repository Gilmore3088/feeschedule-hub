"use client";

import { useActionState } from "react";
import {
  decidePublicDiscoveryFinding,
  type PublicDiscoveryFindingDecisionActionState,
} from "./actions";

const INITIAL_STATE: PublicDiscoveryFindingDecisionActionState | null = null;

export function PublicFindingDecisionForm({
  findingId,
  stateCode,
}: {
  findingId: number;
  stateCode: string;
}) {
  const [state, formAction, isPending] = useActionState(decidePublicDiscoveryFinding, INITIAL_STATE);

  return (
    <form action={formAction} className="grid justify-items-end gap-1.5">
      <input type="hidden" name="finding_id" value={findingId} />
      <input type="hidden" name="state_code" value={stateCode} />
      <div className="flex justify-end gap-1.5">
        <button
          type="submit"
          name="status"
          value="verified"
          disabled={isPending}
          className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30 dark:disabled:border-white/[0.08] dark:disabled:text-gray-500"
        >
          {isPending ? "Reviewing" : "Confirm"}
        </button>
        <button
          type="submit"
          name="status"
          value="dismissed"
          disabled={isPending}
          className="rounded border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          {isPending ? "Reviewing" : "Dismiss"}
        </button>
      </div>
      {state?.message && (
        <p role="status" className="max-w-[180px] rounded bg-emerald-50 px-2 py-1 text-right text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {state.message}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="max-w-[220px] rounded bg-red-50 px-2 py-1 text-right text-[10px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { runAtlasWorkflow, type AtlasWorkflowId } from "../atlas-actions";

/**
 * Three buttons. Nothing else.
 *
 * The main console shows eleven jobs, four alarm banners and two stop controls,
 * and finding the right button in it is genuinely hard. This page exists so the
 * routine job — turn the legacy backlog into published fees — is three clicks in
 * a fixed order with no hunting.
 */

type Step = {
  id: AtlasWorkflowId;
  n: number;
  title: string;
  what: string;
  cost: string;
};

const STEPS: Step[] = [
  {
    id: "reclassify-write",
    n: 1,
    title: "Label the old records",
    what:
      "About 103,000 fee records came in from an old import with no category, so nothing could use them. This labels 10,000 at a time. Run it, watch the number, run it again until it says 0.",
    cost: "Free · about 5 seconds",
  },
  {
    id: "classify",
    n: 2,
    title: "Check the fees make sense",
    what:
      "Rejects anything implausible — a $5,000 monthly fee, a daily cap filed as a per-item charge — and promotes the rest.",
    cost: "Free",
  },
  {
    id: "publish",
    n: 3,
    title: "Publish the ones that passed",
    what:
      "Moves checked fees into the public index and your reports. Only fees with a source document get through.",
    cost: "Free",
  },
];

type Outcome = { runId: number; message: string } | { error: string };

export function RunSteps() {
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState<AtlasWorkflowId | null>(null);
  const [, startTransition] = useTransition();

  function run(step: Step) {
    setRunning(step.id);
    setOutcomes((prev) => ({ ...prev, [step.id]: { runId: 0, message: "Starting…" } }));
    startTransition(async () => {
      const result = await runAtlasWorkflow(step.id);
      if (!result.success || typeof result.runId !== "number") {
        setOutcomes((prev) => ({
          ...prev,
          [step.id]: { error: result.error ?? "Could not start" },
        }));
        setRunning(null);
        return;
      }
      setOutcomes((prev) => ({
        ...prev,
        [step.id]: { runId: result.runId as number, message: "Running…" },
      }));
      triggerAgentRunExecution(result.runId);
      setRunning(null);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {STEPS.map((step) => {
        const outcome = outcomes[step.id];
        const busy = running === step.id;
        return (
          <div
            key={step.id}
            className="rounded-lg border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.02]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {step.n}. {step.title}
                </p>
                <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {step.what}
                </p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {step.cost}
                </p>
              </div>
              <button
                type="button"
                onClick={() => run(step)}
                disabled={busy}
                className="min-h-11 min-w-[132px] rounded-md bg-[var(--brand-primary)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Starting…" : "Run"}
              </button>
            </div>

            {outcome && (
              <div className="mt-5 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
                {"error" in outcome ? (
                  <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                    {outcome.error}
                  </p>
                ) : (
                  <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
                    {outcome.runId > 0 ? (
                      <>
                        Started as run #{outcome.runId}.{" "}
                        <a
                          href="/admin#atlas-live-status"
                          className="font-semibold underline underline-offset-2"
                        >
                          See the result
                        </a>
                        {" — the line you want says how many records it labelled."}
                      </>
                    ) : (
                      outcome.message
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

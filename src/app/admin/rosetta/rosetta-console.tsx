"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, FileText, RotateCw } from "lucide-react";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { runAtlasWorkflow } from "../atlas-actions";

type QueuedRun = {
  id: number;
  reused: boolean;
  title: string;
};

export function RosettaConsole() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [queuedRun, setQueuedRun] = useState<QueuedRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  function queueRead() {
    setQueuedRun(null);
    setError(null);
    startTransition(async () => {
      const result = await runAtlasWorkflow("read");
      if (!result.success || typeof result.runId !== "number") {
        setError(result.error ?? "Rosetta read could not be queued");
        return;
      }

      const title = result.title ?? "Read source documents";
      setQueuedRun({ id: result.runId, reused: Boolean(result.reused), title });
      window.dispatchEvent(new CustomEvent("atlas:started", {
        detail: {
          runId: result.runId,
          title,
          label: "Rosetta read",
          agent: "rosetta",
          reused: result.reused,
          startedAt: new Date().toISOString(),
        },
      }));
      triggerAgentRunExecution(result.runId);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="rosetta-command-heading" className="space-y-4">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Rosetta command</p>
          <h2 id="rosetta-command-heading" className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Read source documents
          </h2>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-4 border-y border-black/[0.06] py-5 sm:flex-row sm:items-center dark:border-white/[0.06]">
        <div className="flex gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Normalize the readable source backlog</p>
            <p className="admin-meta mt-1">
              Rosetta creates text artifacts from fetched PDFs, HTML, and text documents. OCR and browser-render needs stay as explicit backlog.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={queueRead}
          disabled={isPending}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--brand-primary)] px-4 text-sm font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent dark:disabled:border-gray-700"
        >
          {isPending ? <RotateCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isPending ? "Queueing read" : "Queue Rosetta read"}
        </button>
      </div>

      {queuedRun && (
        <JobLaunchReceipt
          jobId={queuedRun.id}
          title={queuedRun.title}
          owner="rosetta"
          command="read"
          scope="Readable source documents"
          reused={queuedRun.reused}
          detail="Atlas created the run record. Live status shows pickup, step events, terminal result, and any blocked reason."
        />
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

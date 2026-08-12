"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  FileSearch,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { runAtlasWorkflow, type AtlasWorkflowId } from "./atlas-actions";

type WorkflowLane = {
  id: AtlasWorkflowId;
  title: string;
  owner: string;
  metric: string;
  detail: string;
  commandLabel: string;
  href: string;
};

const ICONS: Record<AtlasWorkflowId, LucideIcon> = {
  enhance: DatabaseZap,
  discover: FileSearch,
  extract: ScanLine,
  classify: Tags,
  review: ShieldCheck,
};

const ACTIVE_JOB_LIMIT = 3;

function disabledCopy(
  activeJobCount: number,
): string | null {
  if (activeJobCount >= ACTIVE_JOB_LIMIT) return "Job limit reached";
  return null;
}

export function AtlasWorkflowLauncher({
  lanes,
  automationEnabled,
  activeJobCount,
  executionEnabled,
  executionBlockedReason,
}: {
  lanes: WorkflowLane[];
  automationEnabled: boolean;
  activeJobCount: number;
  executionEnabled: boolean;
  executionBlockedReason?: string;
}) {
  const router = useRouter();
  const [pendingWorkflow, setPendingWorkflow] = useState<AtlasWorkflowId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const blockedReason = disabledCopy(
    activeJobCount,
  );
  const backendNote = !automationEnabled
    ? `Safety stop active; run records are visible, but workers stay halted. ${executionBlockedReason ?? ""}`.trim()
    : executionEnabled
      ? "Agentic backend selected"
      : executionBlockedReason ?? "Agentic backend disabled";

  function start(workflow: WorkflowLane) {
    setPendingWorkflow(workflow.id);
    setMessage(`Request sent for ${workflow.title}. Creating a visible agent run...`);
    setError(null);
    startTransition(async () => {
      const result = await runAtlasWorkflow(workflow.id);
      if (!result.success) {
        setMessage(null);
        setError(result.error ?? `${workflow.title} could not start`);
        setPendingWorkflow(null);
        return;
      }
      setMessage(
        result.reused
          ? `${workflow.title} run #${result.runId} is already visible.`
          : `${workflow.title} run #${result.runId} created.`,
      );
      if (typeof result.runId === "number") {
        window.dispatchEvent(new CustomEvent("atlas:started", {
          detail: {
            runId: result.runId,
            title: result.title ?? workflow.title,
            label: workflow.title,
            agent: workflow.owner,
            reused: result.reused,
            startedAt: new Date().toISOString(),
          },
        }));
      }
      setPendingWorkflow(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="workflow-heading">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Workflow launcher</p>
          <h2 id="workflow-heading" className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Choose the next data job
          </h2>
        </div>
        <p className="admin-meta">
          {blockedReason ?? backendNote}
        </p>
      </div>

      <div className="divide-y divide-black/[0.06] border-y border-black/[0.06] dark:divide-white/[0.06] dark:border-white/[0.06]">
        {lanes.map((lane, index) => {
          const Icon = ICONS[lane.id];
          const pending = isPending && pendingWorkflow === lane.id;
          const disabled = Boolean(blockedReason) || isPending;
          return (
            <div key={lane.id} className="grid gap-4 py-4 lg:grid-cols-[40px_1.2fr_1fr_auto] lg:items-center">
              <div className="flex items-center gap-3 lg:block">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="admin-label lg:hidden">Step {index + 1}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{index + 1}. {lane.title}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
                    {lane.owner}
                  </span>
                </div>
                <p className="admin-meta mt-1">{lane.detail}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{lane.metric}</p>
                <p className="admin-meta mt-1">{lane.commandLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => start(lane)}
                  disabled={disabled}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--brand-primary)] px-3 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent dark:disabled:border-gray-700"
                >
                  {pending ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {pending ? "Starting" : blockedReason ?? "Start"}
                </button>
                <Link
                  href={lane.href}
                  className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  Open<ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      {message && (
        <p role="status" className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {message} <a href="#atlas-live-status" className="underline underline-offset-2">Live status</a>
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}

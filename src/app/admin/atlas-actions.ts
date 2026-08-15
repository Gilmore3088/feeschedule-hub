"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  engageEmergencyStop,
  recordEmergencyStopOutcome,
  resumeAutomation,
} from "@/lib/automation-control";
import { cancelAgentRun, cancelAllActiveAgentRuns, startAgentRun } from "@/lib/agents/run-store";
import type { AgentRunStepDefinition, AdminAgent } from "@/lib/agents/types";

export type AtlasWorkflowId = "enhance" | "discover" | "fetch" | "read" | "extract" | "classify" | "publish" | "review";

const FULL_CYCLE_STEPS: AgentRunStepDefinition[] = [
  {
    key: "enhance",
    agent: "atlas",
    title: "Refresh institution source attributes",
  },
  {
    key: "discover",
    agent: "magellan",
    title: "Find and verify missing fee schedule URLs",
  },
  {
    key: "fetch",
    agent: "magellan",
    title: "Fetch source fee documents",
  },
  {
    key: "read",
    agent: "rosetta",
    title: "Read PDFs, HTML, and OCR candidates",
  },
  {
    key: "extract",
    agent: "knox",
    title: "Extract fee observations from normalized text",
  },
  {
    key: "classify",
    agent: "darwin",
    title: "Verify fee observations",
  },
  {
    key: "review",
    agent: "knox",
    title: "Escalate anomaly-only human exceptions",
  },
  {
    key: "publish",
    agent: "hamilton",
    title: "Publish clean fee intelligence for product reads",
  },
];

export async function stopAllAutomation(reason: string): Promise<{
  success: boolean;
  cancelled?: number;
  requested?: number;
  cancellationFailures?: Array<{ runId: number; error: string }>;
  error?: string;
}> {
  const user = await requireAuth("cancel_jobs");
  try {
    await engageEmergencyStop(user.username, reason);
    const cancellations = await cancelAllActiveAgentRuns(user.username);
    await recordEmergencyStopOutcome(user.username, cancellations);
    revalidatePath("/admin");
    return {
      success: true,
      cancelled: cancellations.cancelled,
      requested: cancellations.requested,
      cancellationFailures: cancellations.failed,
    };
  } catch (error) {
    revalidatePath("/admin");
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function resumeAllAutomation(reason: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    await resumeAutomation(user.username, reason);
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runAtlasCycle(): Promise<{
  success: boolean;
  runId?: number;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await startAgentRun({
      agent: "atlas",
      kind: "workflow",
      title: "Atlas full data cycle",
      params: {
        limit: 100,
        requested_concurrency: 4,
        source: "admin.start_atlas",
      },
      triggeredBy: user.username,
      triggerSource: "admin",
      idempotencyKey: "atlas:full-cycle",
      steps: FULL_CYCLE_STEPS,
      summary: "Agentic run accepted. Watch Atlas live status for step events.",
    });
    revalidatePath("/admin");
    return { success: true, runId: result.run.id, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const WORKFLOW_JOBS: Record<AtlasWorkflowId, {
  title: string;
  agent: AdminAgent;
  idempotencyKey: string;
  steps: AgentRunStepDefinition[];
}> = {
  enhance: {
    title: "Enhance institution data",
    agent: "atlas",
    idempotencyKey: "atlas:quick-enhance",
    steps: [
      {
        key: "enhance",
        agent: "atlas",
        title: "Refresh institution source attributes",
      },
    ],
  },
  discover: {
    title: "Find missing fee URLs",
    agent: "magellan",
    idempotencyKey: "magellan:quick-discover",
    steps: [
      {
        key: "discover",
        agent: "magellan",
        title: "Find and verify missing fee schedule URLs",
      },
    ],
  },
  fetch: {
    title: "Fetch source documents",
    agent: "magellan",
    idempotencyKey: "magellan:quick-fetch-sources",
    steps: [
      {
        key: "fetch",
        agent: "magellan",
        title: "Fetch source fee documents",
        input: { limit: 500, skip_with_fees: true },
      },
    ],
  },
  read: {
    title: "Read source documents",
    agent: "rosetta",
    idempotencyKey: "rosetta:quick-read-sources",
    steps: [
      {
        key: "read",
        agent: "rosetta",
        title: "Read PDFs, HTML, and OCR candidates",
        input: { limit: 50 },
      },
    ],
  },
  extract: {
    title: "Extract raw fee observations",
    agent: "knox",
    idempotencyKey: "knox:quick-extract-raw-fees",
    steps: [
      {
        key: "extract",
        agent: "knox",
        title: "Extract fee observations from normalized text",
        input: { limit: 500 },
      },
    ],
  },
  classify: {
    title: "Verify raw fees",
    agent: "darwin",
    idempotencyKey: "darwin:quick-classify",
    steps: [
      {
        key: "classify",
        agent: "darwin",
        title: "Verify staged fee observations",
        input: { batch_size: 500, batches: 1 },
      },
    ],
  },
  publish: {
    title: "Publish verified fee intelligence",
    agent: "hamilton",
    idempotencyKey: "hamilton:quick-publish",
    steps: [
      {
        key: "publish",
        agent: "hamilton",
        title: "Publish clean fee intelligence",
        input: { limit: 500 },
      },
    ],
  },
  review: {
    title: "Review exceptions",
    agent: "knox",
    idempotencyKey: "knox:quick-decision-review",
    steps: [
      {
        key: "review",
        agent: "knox",
        title: "Summarize anomaly-only Knox decisions",
      },
    ],
  },
};

export async function runAtlasWorkflow(workflowId: AtlasWorkflowId): Promise<{
  success: boolean;
  runId?: number;
  title?: string;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  const workflow = WORKFLOW_JOBS[workflowId];
  if (!workflow) return { success: false, error: "Unknown Atlas workflow" };

  try {
    const result = await startAgentRun({
      agent: workflow.agent,
      kind: "workflow_lane",
      title: workflow.title,
      params: {
        workflow_id: workflowId,
        source: "admin.workflow_launcher",
      },
      triggeredBy: user.username,
      triggerSource: "admin",
      idempotencyKey: workflow.idempotencyKey,
      steps: workflow.steps,
      summary: "Agentic run accepted. Watch Atlas live status for step events.",
    });
    revalidatePath("/admin");
    return {
      success: true,
      runId: result.run.id,
      title: workflow.title,
      reused: result.reused,
    };
  } catch (error) {
    revalidatePath("/admin");
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function cancelAtlasRun(runId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await requireAuth("cancel_jobs");
  const result = await cancelAgentRun(runId, user.username);
  revalidatePath("/admin");
  return result;
}

export async function resumeAtlasCycle(runId: number): Promise<{
  success: boolean;
  runId?: number;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  if (!Number.isInteger(runId) || runId < 1) {
    return { success: false, error: "Invalid Atlas pipeline run" };
  }

  try {
    const result = await startAgentRun({
      agent: "atlas",
      kind: "manual_repair",
      title: `Atlas repair for prior pipeline run #${runId}`,
      params: {
        pipeline_run_id: runId,
        source: "admin.resume_pipeline_run",
      },
      triggeredBy: user.username,
      triggerSource: "admin",
      idempotencyKey: `atlas:resume:${runId}`,
      steps: FULL_CYCLE_STEPS,
      summary: "Agentic repair run accepted. Watch Atlas live status for step events.",
    });
    revalidatePath("/admin");
    return { success: true, runId: result.run.id, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import {
  engageEmergencyStop,
  recordEmergencyStopOutcome,
  resumeAutomation,
} from "@/lib/automation-control";
import { cancelAllActiveJobs, cancelJob, spawnJob } from "@/lib/job-runner";

export type AtlasWorkflowId = "enhance" | "discover" | "extract" | "classify" | "review";

export async function stopAllAutomation(reason: string): Promise<{
  success: boolean;
  cancelled?: number;
  requested?: number;
  cancellationFailures?: Array<{ jobId: number; error: string }>;
  error?: string;
}> {
  const user = await requireAuth("cancel_jobs");
  try {
    await engageEmergencyStop(user.username, reason);
    const cancellations = await cancelAllActiveJobs();
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
  jobId?: number;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob(
      "pipeline",
      ["--limit", "100", "--workers", "4"],
      user.username,
      undefined,
      {
        agent: "atlas",
        idempotencyKey: "atlas:full-cycle",
      },
    );
    revalidatePath("/admin");
    return { success: true, jobId: result.jobId, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const WORKFLOW_JOBS: Record<AtlasWorkflowId, {
  command: string;
  args: string[];
  agent: "atlas" | "magellan" | "darwin" | "knox";
  idempotencyKey: string;
}> = {
  enhance: {
    command: "enrich",
    args: [],
    agent: "atlas",
    idempotencyKey: "atlas:quick-enhance",
  },
  discover: {
    command: "discover",
    args: [],
    agent: "magellan",
    idempotencyKey: "magellan:quick-discover",
  },
  extract: {
    command: "crawl",
    args: ["--skip-with-fees", "--limit", "500"],
    agent: "magellan",
    idempotencyKey: "magellan:quick-extract-gaps",
  },
  classify: {
    command: "darwin-drain",
    args: ["--size", "500", "--batches", "1"],
    agent: "darwin",
    idempotencyKey: "darwin:quick-classify",
  },
  review: {
    command: "auto-review",
    args: [],
    agent: "knox",
    idempotencyKey: "knox:quick-auto-review",
  },
};

export async function runAtlasWorkflow(workflowId: AtlasWorkflowId): Promise<{
  success: boolean;
  jobId?: number;
  command?: string;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  const workflow = WORKFLOW_JOBS[workflowId];
  if (!workflow) return { success: false, error: "Unknown Atlas workflow" };

  try {
    const result = await spawnJob(
      workflow.command,
      workflow.args,
      user.username,
      undefined,
      {
        agent: workflow.agent,
        idempotencyKey: workflow.idempotencyKey,
      },
    );
    revalidatePath("/admin");
    return {
      success: true,
      jobId: result.jobId,
      command: workflow.command,
      reused: result.reused,
    };
  } catch (error) {
    revalidatePath("/admin");
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function cancelAtlasJob(jobId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  await requireAuth("cancel_jobs");
  const result = await cancelJob(jobId);
  revalidatePath("/admin");
  return result;
}

export async function resumeAtlasCycle(runId: number): Promise<{
  success: boolean;
  jobId?: number;
  reused?: boolean;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  if (!Number.isInteger(runId) || runId < 1) {
    return { success: false, error: "Invalid Atlas pipeline run" };
  }

  const [run] = await sql`
    SELECT id, status, ops_job_id
      FROM pipeline_runs
     WHERE id = ${runId}
  `;
  if (!run) return { success: false, error: "Atlas pipeline run not found" };
  if (!["failed", "partial", "cancelled"].includes(String(run.status))) {
    return { success: false, error: `Atlas run #${runId} is ${run.status}, not repairable` };
  }

  try {
    const result = await spawnJob(
      "pipeline",
      ["--resume", String(runId), "--limit", "100", "--workers", "4"],
      user.username,
      undefined,
      {
        agent: "atlas",
        idempotencyKey: `atlas:resume:${runId}`,
        parentJobId: run.ops_job_id ? Number(run.ops_job_id) : undefined,
      },
    );
    revalidatePath("/admin");
    return { success: true, jobId: result.jobId, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

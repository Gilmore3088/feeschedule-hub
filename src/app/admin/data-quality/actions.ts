"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/data-store/connection";
import { requireAuth } from "@/lib/auth";
import { startAgentRun } from "@/lib/agents/run-store";

export async function rerunCategorization(): Promise<{
  success: boolean;
  jobId?: number;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await startAgentRun({
      agent: "darwin",
      kind: "manual_repair",
      title: "Rerun fee categorization",
      params: { source: "admin.data_quality.rerun_categorization" },
      triggeredBy: user.username,
      triggerSource: "admin",
      idempotencyKey: "darwin:data-quality:categorize",
      steps: [
        {
          key: "classify",
          agent: "darwin",
          title: "Reclassify staged fee observations",
        },
        {
          key: "verify",
          agent: "darwin",
          title: "Verify canonical fee categories",
        },
      ],
      summary: "Agentic Darwin repair accepted. Watch Atlas live status for step events.",
    });
    revalidatePath("/admin/data-quality");
    return { success: true, jobId: result.run.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function republishIndex(): Promise<{
  success: boolean;
  jobId?: number;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await startAgentRun({
      agent: "hamilton",
      kind: "manual_repair",
      title: "Republish fee index",
      params: { source: "admin.data_quality.republish_index" },
      triggeredBy: user.username,
      triggerSource: "admin",
      idempotencyKey: "hamilton:data-quality:publish-index",
      steps: [
        {
          key: "publish",
          agent: "hamilton",
          title: "Publish verified fee intelligence",
        },
      ],
      summary: "Agentic Hamilton publish run accepted. Watch Atlas live status for step events.",
    });
    revalidatePath("/admin/data-quality");
    return { success: true, jobId: result.run.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function resetZombieJobs(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  await requireAuth("trigger_jobs");
  try {
    const result = await sql`
      UPDATE agent_runs
      SET status = 'failed',
          error_summary = 'Reset by admin (stale agent run)',
          completed_at = NOW()
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '2 hours'
        AND run_kind IN ('workflow', 'workflow_lane', 'report', 'manual_repair', 'dry_run')
    `;
    revalidatePath("/admin/data-quality");
    return { success: true, count: result.count };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/crawler-db/connection";
import { requireAuth } from "@/lib/auth";
import { spawnJob } from "@/lib/job-runner";

export async function rerunCategorization(): Promise<{
  success: boolean;
  jobId?: number;
  error?: string;
}> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("categorize", [], user.username);
    revalidatePath("/admin/data-quality");
    return { success: true, jobId: result.jobId };
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
    const result = await spawnJob("publish-index", [], user.username);
    revalidatePath("/admin/data-quality");
    return { success: true, jobId: result.jobId };
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
      UPDATE ops_jobs
      SET status = 'failed',
          error_summary = 'Reset by admin (zombie job)',
          completed_at = NOW()
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '2 hours'
    `;
    revalidatePath("/admin/data-quality");
    return { success: true, count: result.count };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

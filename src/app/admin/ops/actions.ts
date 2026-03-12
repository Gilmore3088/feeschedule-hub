"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { validateJobRequest, type JobParams } from "@/lib/job-validation";
import { spawnJob, cancelJob } from "@/lib/job-runner";

async function requireOpsPermission(permission: "trigger_jobs" | "cancel_jobs") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!hasPermission(user, permission)) throw new Error("Forbidden");
  return user;
}

export async function triggerJob(
  command: string,
  params: JobParams,
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  try {
    const user = await requireOpsPermission("trigger_jobs");

    const validation = validateJobRequest(command, params);
    if (!validation.valid || !validation.sanitized) {
      return { success: false, error: validation.error };
    }

    const { sanitized } = validation;
    const result = spawnJob(
      sanitized.command,
      sanitized.args,
      user.username,
      params.target_id,
    );

    revalidatePath("/admin/ops");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function cancelOpsJob(
  jobId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireOpsPermission("cancel_jobs");

    const cancelled = cancelJob(jobId);
    if (!cancelled) {
      return { success: false, error: "Job not found or not cancellable" };
    }

    revalidatePath("/admin/ops");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

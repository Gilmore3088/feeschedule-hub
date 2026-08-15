"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { startStateLaneRun } from "@/lib/agents/state-lane-scheduler";
import {
  extractInstitutionCommand,
  markInstitutionOfflineCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string,
) {
  const result = await setInstitutionFeeUrl(institutionId, url);
  return result.success ? { ok: true } : { error: result.error };
}

export async function markOffline(institutionId: number) {
  const result = await markInstitutionOfflineCommand(institutionId);
  return result.success ? { ok: true } : { error: result.error };
}

export async function triggerExtract(institutionId: number) {
  const result = await extractInstitutionCommand(institutionId);
  return result.success
    ? {
        ok: true,
        jobId: result.jobId,
        reused: result.reused,
        message: `Extraction run #${result.jobId} created`,
      }
    : { error: result.error };
}

export async function runStateLane(stateCode: string) {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await startStateLaneRun({
      stateCode,
      triggeredBy: user.username,
      triggerSource: "admin",
      source: "admin.state_lane",
    });
    revalidatePath(`/admin/states/${result.stateCode}`);
    revalidatePath("/admin");
    return {
      ok: true,
      runId: result.run.id,
      reused: result.reused,
      message: result.reused
        ? `Reusing active Atlas ${result.stateCode} lane #${result.run.id}`
        : `Atlas ${result.stateCode} lane #${result.run.id} created`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runStateLaneFormAction(stateCode: string): Promise<void> {
  await runStateLane(stateCode);
}

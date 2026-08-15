"use server";

import { revalidatePath } from "next/cache";
import { runAtlasStateLane } from "@/app/admin/atlas-actions";
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
  const result = await runAtlasStateLane(stateCode);
  if (result.success && result.stateCode && result.runId) {
    revalidatePath(`/admin/states/${result.stateCode}`);
    revalidatePath("/admin");
    return {
      ok: true,
      runId: result.runId,
      reused: result.reused,
      message: result.reused
        ? `Reusing active Atlas ${result.stateCode} lane #${result.runId}`
        : `Atlas ${result.stateCode} lane #${result.runId} created`,
    };
  }
  return { error: result.error ?? "Atlas state lane could not be scheduled." };
}

export async function runStateLaneFormAction(stateCode: string): Promise<void> {
  await runStateLane(stateCode);
}

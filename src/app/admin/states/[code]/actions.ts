"use server";

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
        message: `Extraction queued as job #${result.jobId}`,
      }
    : { error: result.error };
}

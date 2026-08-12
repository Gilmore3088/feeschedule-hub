"use server";

import {
  extractInstitutionCommand,
  markInstitutionOfflineCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";

export async function updateFeeUrl(institutionId: number, url: string) {
  const result = await setInstitutionFeeUrl(institutionId, url);
  return result.success ? { ok: true } : { error: result.error };
}

export async function runExtract(institutionId: number) {
  const result = await extractInstitutionCommand(institutionId);
  return result.success
    ? { ok: true, jobId: result.jobId, reused: result.reused }
    : { error: result.error };
}

export async function markInstitutionOffline(institutionId: number) {
  const result = await markInstitutionOfflineCommand(institutionId);
  return result.success ? { ok: true } : { error: result.error };
}

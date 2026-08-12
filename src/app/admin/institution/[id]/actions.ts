"use server";

import { revalidatePath } from "next/cache";
import {
  extractInstitutionCommand,
  markInstitutionOfflineCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";
import {
  approveFee as approveFeeCanonical,
  approveInstitutionFees,
  editFee,
  markFeeDuplicate,
  rejectFee as rejectFeeCanonical,
} from "@/lib/fee-actions";

export async function updateFeeUrl(institutionId: number, url: string) {
  const result = await setInstitutionFeeUrl(institutionId, url);
  return result.success ? { ok: true } : { error: result.error };
}

export async function approveFee(feeId: number, institutionId: number) {
  const result = await approveFeeCanonical(feeId);
  revalidatePath(`/admin/institution/${institutionId}`);
  return result.success ? { ok: true } : { error: result.error };
}

export async function markDuplicate(feeId: number, institutionId: number) {
  const result = await markFeeDuplicate(feeId);
  revalidatePath(`/admin/institution/${institutionId}`);
  return result.success ? { ok: true } : { error: result.error };
}

export async function rejectFee(feeId: number, institutionId: number) {
  const result = await rejectFeeCanonical(feeId);
  revalidatePath(`/admin/institution/${institutionId}`);
  return result.success ? { ok: true } : { error: result.error };
}

export async function approveAllFees(institutionId: number) {
  const result = await approveInstitutionFees(institutionId);
  revalidatePath(`/admin/institution/${institutionId}`);
  return result.success
    ? { ok: true, count: result.count }
    : { error: result.error, count: 0 };
}

export async function updateFee(
  feeId: number,
  institutionId: number,
  updates: { amount?: number | null; fee_name?: string; conditions?: string },
) {
  const result = await editFee(feeId, updates);
  revalidatePath(`/admin/institution/${institutionId}`);
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

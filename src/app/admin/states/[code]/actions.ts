"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { runAtlasStateLane } from "@/app/admin/atlas-actions";
import {
  updatePublicDiscoveryFindingDecision,
  type PublicDiscoveryFindingDecision,
} from "@/lib/agents/state-lane-memory";
import {
  extractInstitutionCommand,
  markInstitutionOfflineCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";

const findingIdSchema = z.coerce.number().int().positive();
const stateCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/);
const decisionSchema = z.enum(["verified", "dismissed"]);

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

export async function decidePublicDiscoveryFinding(formData: FormData): Promise<void> {
  const user = await requireAuth("approve");
  const findingId = findingIdSchema.safeParse(formData.get("finding_id"));
  const stateCode = stateCodeSchema.safeParse(formData.get("state_code"));
  const status = decisionSchema.safeParse(formData.get("status"));
  if (!findingId.success || !stateCode.success || !status.success) return;

  await updatePublicDiscoveryFindingDecision({
    findingId: findingId.data,
    stateCode: stateCode.data,
    status: status.data as PublicDiscoveryFindingDecision,
    decidedByUserId: user.id,
    decidedByUsername: user.username,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/states");
  revalidatePath(`/admin/states/${stateCode.data}`);
}

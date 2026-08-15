"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { runAtlasStateLane } from "@/app/admin/atlas-actions";
import {
  applyStateSourceMemoryCorrection,
  updatePublicDiscoveryFindingDecision,
  type PublicDiscoveryFindingDecision,
} from "@/lib/agents/state-lane-memory";
import {
  extractInstitutionCommand,
  markInstitutionOfflineCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";

const findingIdSchema = z.coerce.number().int().positive();
const institutionIdSchema = z.coerce.number().int().positive();
const stateCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/);
const decisionSchema = z.enum(["verified", "dismissed"]);
const sourceKindSchema = z.enum(["pdf", "html", "scanned_pdf", "unknown", "offline"]);
const readStrategySchema = z.enum(["", "pdf_text", "html_dom", "browser_render", "ocr", "manual_review"]);

export type SourceMemoryCorrectionActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  institutionId?: number;
  stateCode?: string;
  correctionVersion?: number;
};

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

export async function correctStateSourceMemory(
  _previousState: SourceMemoryCorrectionActionState | null,
  formData: FormData,
): Promise<SourceMemoryCorrectionActionState> {
  const user = await requireAuth("approve");
  const institutionId = institutionIdSchema.safeParse(formData.get("institution_id"));
  const stateCode = stateCodeSchema.safeParse(formData.get("state_code"));
  const sourceKind = sourceKindSchema.safeParse(formData.get("source_kind"));
  const readStrategy = readStrategySchema.safeParse(formData.get("read_strategy"));
  if (!institutionId.success || !stateCode.success || !sourceKind.success || !readStrategy.success) {
    return {
      ok: false,
      error: "Check the institution, state, source kind, and read strategy before locking the correction.",
    };
  }

  const result = await applyStateSourceMemoryCorrection({
    institutionId: institutionId.data,
    stateCode: stateCode.data,
    canonicalSourceUrl: String(formData.get("canonical_source_url") ?? ""),
    sourceKind: sourceKind.data,
    readStrategy: readStrategy.data === "" ? null : readStrategy.data,
    reason: String(formData.get("reason") ?? ""),
    correctedBy: user.username ?? `user:${user.id}`,
  });

  if (!result.success) {
    return {
      ok: false,
      institutionId: institutionId.data,
      stateCode: stateCode.data,
      error: result.error ?? "Atlas could not lock this source correction.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/states");
  revalidatePath(`/admin/states/${stateCode.data}`);

  return {
    ok: true,
    institutionId: institutionId.data,
    stateCode: stateCode.data,
    correctionVersion: result.correctionVersion,
    message: `Locked source memory for ${stateCode.data}${result.correctionVersion ? ` · v${result.correctionVersion}` : ""}.`,
  };
}

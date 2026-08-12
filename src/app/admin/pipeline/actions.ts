"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { spawnJob } from "@/lib/job-runner";
import {
  bulkSetInstitutionFeeUrls,
  createInstitutionCommand,
  setInstitutionFeeUrl,
} from "@/lib/institution-commands";

export async function runCrawlGaps(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("crawl", ["--skip-with-fees", "--limit", "500"], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runCategorize(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("categorize", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runAutoReview(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("auto-review", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runSmartPipeline(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob(
      "pipeline",
      ["--limit", "100"],
      user.username,
      undefined,
      { agent: "atlas", idempotencyKey: "atlas:full-cycle" },
    );
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runOutlierDetect(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("outlier-detect", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runValidate(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("validate", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runEnrich(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("enrich", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runDiscover(state?: string): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  if (state && !/^[A-Z]{2}$/.test(state)) {
    return { success: false, error: "Invalid state code" };
  }
  try {
    const args: string[] = [];
    if (state) args.push("--state", state);
    const result = await spawnJob("discover", args, user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runRefreshData(cadence: string = "daily"): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("refresh-data", ["--cadence", cadence], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function addInstitution(
  name: string,
  stateCode: string,
  charterType: "bank" | "credit_union",
  websiteUrl?: string,
  feeScheduleUrl?: string,
): Promise<{ success: boolean; id?: number; error?: string }> {
  return createInstitutionCommand({ name, stateCode, charterType, websiteUrl, feeScheduleUrl });
}

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string
): Promise<{ success: boolean; error?: string }> {
  return setInstitutionFeeUrl(institutionId, url);
}

export async function bulkImportUrls(
  csvText: string
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  return bulkSetInstitutionFeeUrls(csvText);
}

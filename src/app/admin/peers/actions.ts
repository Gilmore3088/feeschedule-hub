"use server";

import { requireAuth } from "@/lib/auth";
import { savePeerSet, deletePeerSet } from "@/lib/crawler-db";
import { getWriteDb } from "@/lib/crawler-db/connection";
import { spawnJob } from "@/lib/job-runner";
import type { PeerFilters } from "@/lib/fed-districts";
import { revalidatePath } from "next/cache";

export async function createPeerSet(
  name: string,
  filters: PeerFilters
): Promise<{ id: number }> {
  const user = await requireAuth("approve");

  if (!name || name.trim().length === 0) {
    throw new Error("Name is required");
  }

  const id = savePeerSet(
    name.trim(),
    {
      charter_type: filters.charter,
      asset_tiers: filters.tiers,
      fed_districts: filters.districts,
    },
    user.username
  );

  revalidatePath("/admin/peers");
  return { id };
}

export async function removePeerSet(id: number): Promise<void> {
  const user = await requireAuth("approve");

  deletePeerSet(id, user.username);
  revalidatePath("/admin/peers");
}

export async function updateFeeScheduleUrl(
  institutionId: number,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAuth("trigger_jobs");

  if (!url.trim()) {
    return { success: false, error: "URL is required" };
  }

  try {
    new URL(url.trim());
  } catch {
    return { success: false, error: "Invalid URL format" };
  }

  const db = getWriteDb();
  try {
    db.prepare("UPDATE crawl_targets SET fee_schedule_url = ? WHERE id = ?").run(url.trim(), institutionId);
    revalidatePath(`/admin/peers/${institutionId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    db.close();
  }
}

export async function crawlInstitution(
  institutionId: number,
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");

  try {
    const result = await spawnJob(
      "crawl",
      ["--target-id", String(institutionId)],
      user.username,
      institutionId,
    );
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

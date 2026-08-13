"use server";

import { requireAuth } from "@/lib/auth";
import { savePeerSet, deletePeerSet } from "@/lib/data-store";
import { extractInstitutionCommand, setInstitutionFeeUrl } from "@/lib/institution-commands";
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

  const id = await savePeerSet(
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

  await deletePeerSet(id, user.username);
  revalidatePath("/admin/peers");
}

export async function updateFeeScheduleUrl(
  institutionId: number,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  return setInstitutionFeeUrl(institutionId, url);
}

export async function extractInstitution(
  institutionId: number,
): Promise<{ success: boolean; jobId?: number; reused?: boolean; error?: string }> {
  return extractInstitutionCommand(institutionId);
}

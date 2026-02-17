"use server";

import { requireAuth } from "@/lib/auth";
import { savePeerSet, deletePeerSet } from "@/lib/crawler-db";
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

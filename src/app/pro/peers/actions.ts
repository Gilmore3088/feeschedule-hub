"use server";

import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import {
  savePeerSet,
  deletePeerSet,
  getSavedPeerSets,
} from "@/lib/crawler-db/saved-peers";
import { revalidatePath } from "next/cache";

export interface SavedGroup {
  id: number;
  name: string;
  charter_type: string | null;
  tiers: string | null;
  districts: string | null;
}

export async function getSavedGroups(): Promise<SavedGroup[]> {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) return [];

  const sets = await getSavedPeerSets(user.username);
  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    charter_type: s.charter_type,
    tiers: s.tiers,
    districts: s.districts,
  }));
}

export async function saveGroup(
  name: string,
  filters: { charter?: string; tiers?: string[]; districts?: number[] }
): Promise<{ id: number }> {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) throw new Error("Unauthorized");

  if (!name.trim()) throw new Error("Name is required");

  // Check max 10
  const existing = await getSavedPeerSets(user.username);
  if (existing.length >= 10) throw new Error("Maximum 10 saved peer groups");

  const id = await savePeerSet(
    name.trim(),
    {
      charter_type: filters.charter,
      asset_tiers: filters.tiers,
      fed_districts: filters.districts,
    },
    user.username
  );

  revalidatePath("/pro/peers");
  return { id };
}

export async function deleteGroup(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) throw new Error("Unauthorized");

  await deletePeerSet(id, user.username);
  revalidatePath("/pro/peers");
}

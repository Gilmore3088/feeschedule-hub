"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import {
  getSavedPeerSets,
  savePeerSet,
  deletePeerSet,
} from "@/lib/crawler-db/saved-peers";

const ProfileSchema = z.object({
  institution_name: z.string().min(1).max(200).trim(),
  institution_type: z.enum(["bank", "credit_union"]).nullable(),
  asset_tier: z.enum(["a", "b", "c", "d", "e", "f"]).nullable(),
  state_code: z.string().length(2).toUpperCase().nullable(),
  fed_district: z.coerce.number().int().min(1).max(12).nullable(),
});

export type ProfileFormState = {
  success: boolean;
  error?: string;
};

export async function updateInstitutionProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const raw = {
    institution_name: formData.get("institution_name"),
    institution_type: formData.get("institution_type") || null,
    asset_tier: formData.get("asset_tier") || null,
    state_code: formData.get("state_code") || null,
    fed_district: formData.get("fed_district") || null,
  };

  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: firstIssue
        ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
        : "Invalid input",
    };
  }

  const { institution_name, institution_type, asset_tier, state_code, fed_district } =
    parsed.data;

  // Idempotent migration — ensures column exists before write
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT`;
  } catch {
    // Column may already exist or DB doesn't support IF NOT EXISTS — ignore
  }

  await sql`
    UPDATE users
    SET
      institution_name = ${institution_name},
      institution_type = ${institution_type},
      asset_tier       = ${asset_tier},
      state_code       = ${state_code},
      fed_district     = ${fed_district}
    WHERE id = ${user.id}
  `;

  revalidatePath("/pro");

  return { success: true };
}

// ─── Peer Set Management (SET-02) ─────────────────────────────────────────────

const PeerSetSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  charter_type: z.enum(["bank", "credit_union"]).nullable(),
  asset_tiers: z.array(z.enum(["a", "b", "c", "d", "e", "f"])).optional(),
  fed_districts: z.array(z.coerce.number().int().min(1).max(12)).optional(),
});

export async function createPeerSet(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const raw = {
    name: formData.get("name"),
    charter_type: formData.get("charter_type") || null,
    asset_tiers: formData.getAll("asset_tiers").filter(Boolean) as string[],
    fed_districts: formData.getAll("fed_districts").filter(Boolean).map(Number),
  };

  const parsed = PeerSetSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const id = await savePeerSet(
    parsed.data.name,
    {
      charter_type: parsed.data.charter_type ?? undefined,
      asset_tiers: parsed.data.asset_tiers,
      fed_districts: parsed.data.fed_districts,
    },
    String(user.id)
  );

  revalidatePath("/pro/settings");
  return { success: true, id };
}

export async function removePeerSet(id: number) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  await deletePeerSet(id, String(user.id));
  revalidatePath("/pro/settings");
  return { success: true };
}

export { getSavedPeerSets };

// ─── Intelligence Snapshot (SET-05) ───────────────────────────────────────────

export interface IntelligenceSnapshot {
  tier: string;
  savedAnalyses: number;
  savedScenarios: number;
  lastActivity: string | null;
}

export async function getIntelligenceSnapshot(): Promise<IntelligenceSnapshot> {
  const user = await getCurrentUser();
  if (!user) return { tier: "Unknown", savedAnalyses: 0, savedScenarios: 0, lastActivity: null };

  let savedAnalyses = 0;
  let savedScenarios = 0;
  let lastActivity: string | null = null;

  try {
    const aRows = await sql`
      SELECT COUNT(*)::int as count FROM hamilton_saved_analyses
      WHERE user_id = ${user.id} AND status = 'active'
    `;
    savedAnalyses = aRows[0]?.count ?? 0;
  } catch { /* table may not exist yet */ }

  try {
    const sRows = await sql`
      SELECT COUNT(*)::int as count FROM hamilton_scenarios
      WHERE user_id = ${user.id} AND status = 'active'
    `;
    savedScenarios = sRows[0]?.count ?? 0;
  } catch { /* table may not exist yet */ }

  try {
    const lRows = await sql`
      SELECT MAX(updated_at) as last_active FROM hamilton_saved_analyses
      WHERE user_id = ${user.id}
    `;
    lastActivity = lRows[0]?.last_active ? String(lRows[0].last_active) : null;
  } catch { /* table may not exist yet */ }

  return {
    tier: user.role === "admin" ? "Admin" : "Professional",
    savedAnalyses,
    savedScenarios,
    lastActivity,
  };
}

"use server";

import { logout, getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import crypto from "crypto";

export async function logoutAction() {
  await logout();
}

export async function updateProfile(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const institutionName = formData.get("institution_name") as string | null;
  const institutionType = formData.get("institution_type") as string | null;
  const assetTier = formData.get("asset_tier") as string | null;
  const stateCode = formData.get("state_code") as string | null;
  const jobRole = formData.get("job_role") as string | null;

  try {
    await sql`
      UPDATE users SET institution_name = ${institutionName?.trim() || null},
       institution_type = ${institutionType || null},
       asset_tier = ${assetTier || null},
       state_code = ${stateCode || null},
       job_role = ${jobRole || null}
       WHERE id = ${user.id}`;
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update profile" };
  }
}

export async function generateApiKey(): Promise<{
  success: boolean;
  key?: string;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const rawKey = `bfi_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 16) + "...";

  try {
    await sql.begin(async (tx: any) => {
      await tx`UPDATE api_keys SET is_active = 0 WHERE user_id = ${user.id}`;
      await tx`
        INSERT INTO api_keys (user_id, key_hash, key_prefix, tier, monthly_limit)
        VALUES (${user.id}, ${keyHash}, ${keyPrefix}, 'pro', 5000)`;
    });
    return { success: true, key: rawKey };
  } catch {
    return { success: false, error: "Failed to generate key" };
  }
}

export async function revokeApiKey(): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    await sql`UPDATE api_keys SET is_active = 0 WHERE user_id = ${user.id}`;
    return { success: true };
  } catch {
    return { success: false, error: "Failed to revoke key" };
  }
}

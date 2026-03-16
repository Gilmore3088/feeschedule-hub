"use server";

import { logout, getCurrentUser } from "@/lib/auth";
import { getWriteDb } from "@/lib/crawler-db/connection";
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

  const db = getWriteDb();
  try {
    db.prepare(
      `UPDATE users SET institution_name = ?, institution_type = ?,
       asset_tier = ?, state_code = ?, job_role = ?
       WHERE id = ?`
    ).run(
      institutionName?.trim() || null,
      institutionType || null,
      assetTier || null,
      stateCode || null,
      jobRole || null,
      user.id,
    );
    return { success: true };
  } catch (e) {
    console.error("[updateProfile]", e);
    return { success: false, error: "Failed to update profile" };
  } finally {
    db.close();
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

  const db = getWriteDb();
  try {
    // Deactivate any existing keys for this user
    db.prepare("UPDATE api_keys SET is_active = 0 WHERE user_id = ?").run(user.id);

    db.prepare(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, tier, monthly_limit)
       VALUES (?, ?, ?, 'pro', 5000)`
    ).run(user.id, keyHash, keyPrefix);

    return { success: true, key: rawKey };
  } catch (e) {
    console.error("[generateApiKey]", e);
    return { success: false, error: "Failed to generate key" };
  } finally {
    db.close();
  }
}

export async function revokeApiKey(): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const db = getWriteDb();
  try {
    db.prepare("UPDATE api_keys SET is_active = 0 WHERE user_id = ?").run(user.id);
    return { success: true };
  } catch (e) {
    console.error("[revokeApiKey]", e);
    return { success: false, error: "Failed to revoke key" };
  } finally {
    db.close();
  }
}
